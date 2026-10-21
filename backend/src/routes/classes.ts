import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rate-limit';
import { Prisma, prisma } from '../lib/prisma';
import { InvalidResourceFileError, uploadResourceFile } from '../lib/storage';
import { deleteFromCloudinary, uploadToCloudinary } from '../lib/cloudinary';


const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

class ClassLimitReached extends Error {}

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validateClassMaterialNotes(notes: string | null): string | null {
  if (notes === null) return null;
  if (notes.length > 10000) throw new Error('Class material is too long');

  let data: unknown;
  try {
    data = JSON.parse(notes);
  } catch {
    return notes;
  }
  if (!data || typeof data !== 'object' || (data as { format?: string }).format !== 'studyos-class-resource') return notes;

  const material = data as { kind?: string; title?: string; content?: string; url?: string; timestampSeconds?: number };
  if (!['YOUTUBE', 'NOTE', 'CODE'].includes(String(material.kind))) throw new Error('Unsupported class material type');
  if (typeof material.title !== 'string' || material.title.trim().length > 200) throw new Error('Class material title is invalid');
  if (material.kind === 'YOUTUBE') {
    try {
      const url = new URL(String(material.url || ''));
      if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
        throw new Error('invalid');
      }
      const timestamp = Number(material.timestampSeconds || 0);
      if (!Number.isInteger(timestamp) || timestamp < 0) throw new Error('invalid');
      material.url = url.toString();
      material.timestampSeconds = timestamp;
    } catch {
      throw new Error('A valid HTTPS YouTube URL and timestamp are required');
    }
  } else if (typeof material.content !== 'string' || material.content.length > 10000) {
    throw new Error('Class note or code content is invalid');
  }
  return JSON.stringify(data);
}

async function ownsClass(classId: string, userId: string): Promise<boolean> {
  return Boolean(await prisma.virtualStudyClass.findFirst({
    where: { id: classId, creatorId: userId },
    select: { id: true },
  }));
}

const classInclude = {
  creator: { select: { id: true, name: true, avatarUrl: true } },
  topics: {
    orderBy: { order: 'asc' as const },
    include: {
      resources: {
        include: {
          resource: {
            select: {
              id: true,
              title: true,
              type: true,
              subject: true,
              visibility: true,
              creatorId: true,
              files: { select: { id: true, fileName: true } },
            },
          },
        },
      },
    },
  },
};

function safeFileName(fileName: string): string {
  return fileName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || 'published-file';
}

function storagePath(fileUrl: string, bucketName: string): string | null {
  if (!/^https?:\/\//i.test(fileUrl)) {
    return fileUrl && !fileUrl.split('/').includes('..') ? fileUrl : null;
  }
  try {
    const url = new URL(fileUrl);
    for (const visibility of ['private', 'public', 'sign']) {
      const prefix = `/storage/v1/object/${visibility}/${bucketName}/`;
      if (url.pathname.startsWith(prefix)) return decodeURIComponent(url.pathname.slice(prefix.length));
    }
    return null;
  } catch {
    return null;
  }
}

function classMaterialMarkdown(notes: string | null): string {
  if (!notes) return '';
  try {
    const material: unknown = JSON.parse(notes);
    if (!material || typeof material !== 'object' || (material as { format?: string }).format !== 'studyos-class-resource') {
      return notes;
    }
    const data = material as { kind?: string; title?: string; content?: string; url?: string; timestampSeconds?: number };
    if (data.kind === 'YOUTUBE') {
      return `[${data.title || 'YouTube video'}](${data.url || ''}) (starts at ${data.timestampSeconds || 0}s)`;
    }
    return `### ${data.title || 'Class material'}\n\n${data.content || ''}`;
  } catch {
    return notes;
  }
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classes = await prisma.virtualStudyClass.findMany({
      where: { creatorId: req.user!.id },
      include: classInclude,
      orderBy: { createdAt: 'desc' },
    });

    const visibleClasses = classes.map((studyClass) => ({
      ...studyClass,
      topics: studyClass.topics.map((topic) => ({
        ...topic,
        resources: topic.resources.filter(({ resource }) =>
          !resource || resource.visibility === 'PUBLIC' || resource.creatorId === req.user!.id,
        ),
      })),
    }));

    res.json({ classes: visibleClasses });
  } catch (error) {
    console.error('Failed to list classes:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing class id' });

    const studyClass = await prisma.virtualStudyClass.findFirst({
      where: { id, creatorId: req.user!.id },
      include: classInclude,
    });
    if (!studyClass) return res.status(404).json({ error: 'Class not found' });

    studyClass.topics = studyClass.topics.map((topic) => ({
      ...topic,
      resources: topic.resources.filter(({ resource }) =>
        !resource || resource.visibility === 'PUBLIC' || resource.creatorId === req.user!.id,
      ),
    }));
    res.json({ class: studyClass });
  } catch (error) {
    console.error('Failed to fetch class:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    if (name.length > 120 || description.length > 5000) {
      return res.status(400).json({ error: 'Class name or description is too long' });
    }

    const studyClass = await prisma.$transaction(async (transaction) => {
      const count = await transaction.virtualStudyClass.count({ where: { creatorId: req.user!.id } });
      if (count >= 10) {
        throw new ClassLimitReached();
      }

      return transaction.virtualStudyClass.create({
        data: {
          name,
          description: description || null,
          creatorId: req.user!.id,
        },
        include: classInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });

    res.status(201).json({ class: studyClass });
  } catch (error) {
    if (error instanceof ClassLimitReached) {
      return res.status(409).json({ error: 'You can create a maximum of 10 virtual study classes' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ error: 'Class limit changed during creation; please retry' });
    }
    console.error('Failed to create class:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/publish', requireAuth, async (req: AuthenticatedRequest, res) => {
  const storedPaths: string[] = [];
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'studyos-resources';

  try {
    const classId = getParam(req.params.id);
    if (!classId) return res.status(400).json({ error: 'Missing class id' });

    const selectionMode = String(req.body?.selectionMode || '').toUpperCase();
    const topicIds = Array.isArray(req.body?.topicIds)
      ? req.body.topicIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const resourceIds = Array.isArray(req.body?.resourceIds)
      ? req.body.resourceIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (!['CLASS', 'TOPICS', 'RESOURCES'].includes(selectionMode)) {
      return res.status(400).json({ error: 'Choose the class, selected topics, or selected materials to publish' });
    }
    if (selectionMode === 'TOPICS' && !topicIds.length) {
      return res.status(400).json({ error: 'Select at least one topic to publish' });
    }
    if (selectionMode === 'RESOURCES' && !resourceIds.length) {
      return res.status(400).json({ error: 'Select at least one material to publish' });
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const topic = String(req.body?.topic || '').trim();
    const resourceType = String(req.body?.type || 'NOTE').trim().toUpperCase();
    const access = String(req.body?.access || 'FREE').trim().toUpperCase();
    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : String(req.body?.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean).slice(0, 20);
    const degree = String(req.body?.degree || '').trim();
    const semester = String(req.body?.semester || '').trim();
    const price = req.body?.price === '' || req.body?.price == null ? null : Number(req.body.price);
    const paymentMethod = String(req.body?.paymentMethod || '').trim().toUpperCase();
    const upiId = String(req.body?.upiId || '').trim();
    const paymentInstructions = String(req.body?.paymentInstructions || '').trim();

    if (!title || title.length > 160) return res.status(400).json({ error: 'Title is required and must be 160 characters or fewer' });
    if (description.length > 5000 || subject.length > 120 || topic.length > 120 || degree.length > 120 || semester.length > 80) {
      return res.status(400).json({ error: 'One or more resource details are too long' });
    }
    if (!['NOTE', 'PDF', 'VIDEO', 'LINK', 'CODE'].includes(resourceType)) {
      return res.status(400).json({ error: 'Choose a supported resource type' });
    }
    if (!['FREE', 'PAID'].includes(access)) return res.status(400).json({ error: 'Access must be free or paid' });
    if (access === 'PAID' && (!Number.isFinite(price) || price! <= 0)) {
      return res.status(400).json({ error: 'Enter a valid price for this paid resource' });
    }
    if (access === 'PAID' && !['UPI', 'CASH'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Choose UPI or cash as the payment method' });
    }
    if (paymentMethod === 'UPI' && !upiId) return res.status(400).json({ error: 'Enter the UPI ID for direct payment' });
    if (upiId.length > 160 || paymentInstructions.length > 2000) {
      return res.status(400).json({ error: 'Payment information is too long' });
    }

    const studyClass = await prisma.virtualStudyClass.findFirst({
      where: { id: classId, creatorId: req.user!.id },
      select: {
        id: true,
        topics: {
          where: selectionMode === 'TOPICS' ? { id: { in: topicIds } } : undefined,
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            resources: {
              where: selectionMode === 'RESOURCES' ? { id: { in: resourceIds } } : undefined,
              select: {
                id: true,
                notes: true,
                resource: {
                  select: {
                    id: true,
                    title: true,
                    creatorId: true,
                    visibility: true,
                    creator: { select: { name: true } },
                    files: { select: { fileUrl: true, fileName: true, fileSize: true, mimeType: true } },
                    links: { select: { url: true, title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!studyClass) return res.status(404).json({ error: 'Class not found' });
    if (selectionMode === 'TOPICS' && studyClass.topics.length !== new Set(topicIds).size) {
      return res.status(400).json({ error: 'One or more selected topics do not belong to this class' });
    }
    const selectedMaterials = studyClass.topics.flatMap((classTopic) =>
      classTopic.resources.map((material) => ({ ...material, topicName: classTopic.name })),
    );
    if (selectedMaterials.length > 100) {
      return res.status(400).json({ error: 'Select no more than 100 materials per Vault resource' });
    }
    if (selectionMode === 'RESOURCES' &&
      selectedMaterials.length !== new Set(resourceIds).size) {
      return res.status(400).json({ error: 'One or more selected materials are unavailable or the selection is too large' });
    }
    if (!selectedMaterials.length) return res.status(400).json({ error: 'There is no study material in the selected content' });
    if (selectedMaterials.some(({ resource }) =>
      resource && resource.creatorId !== req.user!.id && resource.visibility !== 'PUBLIC',
    )) {
      return res.status(403).json({ error: 'A selected resource is no longer publicly available' });
    }

    const markdown = [
      `# ${title}`,
      description,
      subject ? `Subject: ${subject}` : '',
      topic ? `Topic: ${topic}` : '',
      degree ? `Degree / stream: ${degree}` : '',
      semester ? `Semester: ${semester}` : '',
      '',
      ...studyClass.topics.flatMap((classTopic) => {
        const materials = classTopic.resources;
        if (!materials.length) return [];
        return [
          `## ${classTopic.name}`,
          ...materials.flatMap((material) => {
            const lines = [classMaterialMarkdown(material.notes)].filter(Boolean);
            const source = material.resource;
            if (!source) return lines;
            const isOwner = source.creatorId === req.user!.id;
            if (isOwner) {
              lines.push(`Attached resource: ${source.title}`);
            } else {
              lines.push(`Public reference: ${source.title} — by ${source.creator.name} (StudyOS resource ${source.id})`);
            }
            return lines;
          }),
          '',
        ];
      }),
      '',
      'Only publish material you own or have permission to share. Follow your institution’s academic rules.',
    ].filter((line) => line !== undefined).join('\n');
    const snapshotBuffer = Buffer.from(markdown, 'utf8');
    if (snapshotBuffer.byteLength > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'The selected study material is too large to publish in one resource' });
    }

    
    
    

    const resourceId = randomUUID();
    const snapshotPath = `${req.user!.id}/${resourceId}/published-study-notes.md`;
    
    try {
      const snapshotResult = await uploadToCloudinary(snapshotBuffer, { folder: `studyos/${req.user!.id}/${resourceId}`, resource_type: 'raw', format: 'md' });
      const newPath = snapshotResult.secure_url;
      storedPaths.push(newPath);
      // override snapshotPath for the code below
      var actualSnapshotPath = newPath;
    } catch (snapshotError: any) {
      throw new Error(`Study material snapshot upload failed: ${snapshotError.message}`);
    }

    const fileCopies: Array<{ fileUrl: string; fileName: string; fileSize: number | null; mimeType: string | null }> = [{
      fileUrl: actualSnapshotPath,
      fileName: `${safeFileName(title)}.md`,
      fileSize: snapshotBuffer.byteLength,
      mimeType: 'text/plain',
    }];
    const copiedResourceIds = new Set<string>();
    const sourceLinks: Array<{ url: string; title: string | null }> = [];
    for (const material of selectedMaterials) {
      const source = material.resource;
      if (!source || source.creatorId !== req.user!.id || copiedResourceIds.has(source.id)) continue;
      copiedResourceIds.add(source.id);
      sourceLinks.push(...source.links);
      for (const sourceFile of source.files) {
        const sourceUrl = sourceFile.fileUrl;
        try {
          // Re-upload from URL
          const result = await require('cloudinary').v2.uploader.upload(sourceUrl, { folder: `studyos/${req.user!.id}/${resourceId}`, resource_type: 'auto' });
          storedPaths.push(result.secure_url);
          fileCopies.push({ ...sourceFile, fileUrl: result.secure_url });
        } catch (copyError: any) {
          throw new Error(`An owned source file could not be copied: ${copyError.message}`);
        }
      }
    }

    const resource = await prisma.resource.create({
      data: {
        id: resourceId,
        title,
        description: description || null,
        type: resourceType,
        subject: subject || null,
        topic: topic || null,
        visibility: 'PUBLIC',
        price: access === 'PAID' ? price : null,
        paymentMethod: access === 'PAID' ? paymentMethod : null,
        upiId: access === 'PAID' && paymentMethod === 'UPI' ? upiId : null,
        paymentInst: access === 'PAID' ? paymentInstructions || null : null,
        creator: { connect: { id: req.user!.id } },
        files: { create: fileCopies },
        links: { create: sourceLinks },
        tags: {
          create: [
            ...tags.map((tag: string) => ({ tag })),
            ...(degree ? [{ tag: `Degree: ${degree}` }] : []),
            ...(semester ? [{ tag: `Semester: ${semester}` }] : []),
          ],
        },
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        files: true,
        links: true,
        tags: { select: { tag: true } },
      },
    });

    res.status(201).json({ resource });
  } catch (error) {
    if (storedPaths.length) {
      try {
        
        
        await Promise.all(storedPaths.map(path => deleteFromCloudinary(path)));
      } catch (cleanupError) {
        console.error('Failed to clean up an incomplete Vault publication:', cleanupError);
      }
    }
    console.error('Failed to publish class material:', error);
    res.status(500).json({ error: 'Unable to publish study material' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!id || !name) {
      return res.status(400).json({ error: 'Class id and name are required' });
    }
    if (name.length > 120 || description.length > 5000) {
      return res.status(400).json({ error: 'Class name or description is too long' });
    }
    if (!(await ownsClass(id, req.user!.id))) {
      const exists = await prisma.virtualStudyClass.findUnique({ where: { id }, select: { id: true } });
      return res.status(exists ? 403 : 404).json({ error: exists ? 'You can only edit your own classes' : 'Class not found' });
    }

    const studyClass = await prisma.virtualStudyClass.update({
      where: { id },
      data: { name, description: description || null },
      include: classInclude,
    });
    res.json({ class: studyClass });
  } catch (error) {
    console.error('Failed to update class:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Missing class id' });
    }
    if (!(await ownsClass(id, req.user!.id))) {
      const exists = await prisma.virtualStudyClass.findUnique({ where: { id }, select: { id: true } });
      return res.status(exists ? 403 : 404).json({ error: exists ? 'You can only delete your own classes' : 'Class not found' });
    }

    await prisma.virtualStudyClass.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete class:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/topics', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!classId || !name) {
      return res.status(400).json({ error: 'Class id and topic name are required' });
    }
    if (name.length > 120) {
      return res.status(400).json({ error: 'Topic name is too long' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      const exists = await prisma.virtualStudyClass.findUnique({ where: { id: classId }, select: { id: true } });
      return res.status(exists ? 403 : 404).json({ error: exists ? 'You can only edit your own classes' : 'Class not found' });
    }

    const lastTopic = await prisma.virtualStudyTopic.findFirst({
      where: { classId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const topic = await prisma.virtualStudyTopic.create({
      data: { classId, name, order: lastTopic ? lastTopic.order + 1 : 0 },
      include: { resources: { include: { resource: { select: { id: true, title: true, type: true } } } } },
    });
    res.status(201).json({ topic });
  } catch (error) {
    console.error('Failed to create class topic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/topics/:topicId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const topicId = getParam(req.params.topicId);
    const name = String(req.body?.name || '').trim();
    if (!classId || !topicId || !name) {
      return res.status(400).json({ error: 'Class id, topic id and topic name are required' });
    }
    if (name.length > 120) {
      return res.status(400).json({ error: 'Topic name is too long' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      return res.status(403).json({ error: 'You can only edit your own classes' });
    }
    const topic = await prisma.virtualStudyTopic.findFirst({ where: { id: topicId, classId }, select: { id: true } });
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const updatedTopic = await prisma.virtualStudyTopic.update({ where: { id: topicId }, data: { name } });
    res.json({ topic: updatedTopic });
  } catch (error) {
    console.error('Failed to update class topic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/topics/:topicId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const topicId = getParam(req.params.topicId);
    if (!classId || !topicId) {
      return res.status(400).json({ error: 'Missing class or topic id' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      return res.status(403).json({ error: 'You can only edit your own classes' });
    }
    const topic = await prisma.virtualStudyTopic.findFirst({ where: { id: topicId, classId }, select: { id: true } });
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await prisma.virtualStudyTopic.delete({ where: { id: topicId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete class topic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/topics/reorder', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const topicIds: unknown = req.body?.topicIds;
    if (!classId || !Array.isArray(topicIds) || !topicIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'A valid ordered list of topic ids is required' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      return res.status(403).json({ error: 'You can only edit your own classes' });
    }

    const existingTopics = await prisma.virtualStudyTopic.findMany({ where: { classId }, select: { id: true } });
    const requested = topicIds as string[];
    if (requested.length !== existingTopics.length || new Set(requested).size !== requested.length ||
        existingTopics.some(({ id }) => !requested.includes(id))) {
      return res.status(400).json({ error: 'The ordered ids must include every class topic exactly once' });
    }

    await prisma.$transaction(requested.map((id, order) =>
      prisma.virtualStudyTopic.update({ where: { id }, data: { order } }),
    ));
    const topics = await prisma.virtualStudyTopic.findMany({ where: { classId }, orderBy: { order: 'asc' } });
    res.json({ topics });
  } catch (error) {
    console.error('Failed to reorder class topics:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/topics/:topicId/resources', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const topicId = getParam(req.params.topicId);
    const resourceId = req.body?.resourceId ? String(req.body.resourceId) : null;
    let notes: string | null;
    try {
      notes = validateClassMaterialNotes(req.body?.notes == null ? null : String(req.body.notes).trim());
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid class material' });
    }
    if (!classId || !topicId || (!resourceId && !notes)) {
      return res.status(400).json({ error: 'A topic resource or note is required' });
    }
    if (notes && notes.length > 10000) {
      return res.status(400).json({ error: 'Class resource notes are too long' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      return res.status(403).json({ error: 'You can only edit your own classes' });
    }
    const topic = await prisma.virtualStudyTopic.findFirst({ where: { id: topicId, classId }, select: { id: true } });
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    if (resourceId) {
      const resource = await prisma.resource.findUnique({ where: { id: resourceId }, select: { id: true, creatorId: true, visibility: true } });
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
        return res.status(403).json({ error: 'You cannot add this private resource' });
      }
    }

    const classResource = await prisma.virtualStudyResource.create({
      data: { topicId, resourceId, notes },
      include: { resource: { select: { id: true, title: true, type: true, creatorId: true, files: { select: { id: true, fileName: true } } } } },
    });
    res.status(201).json({ classResource });
  } catch (error) {
    console.error('Failed to add class resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/:id/topics/:topicId/files',
  requireAuth,
  uploadLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Class files must be 10 MB or smaller' });
      }
      console.error('Failed to read class file upload:', error);
      return res.status(400).json({ error: 'Unable to read the uploaded file' });
    });
  },
  async (req: AuthenticatedRequest, res) => {
    let uploadedPath: string | null = null;
    try {
      const classId = getParam(req.params.id);
      const topicId = getParam(req.params.topicId);
      const file = req.file;
      if (!classId || !topicId || !file) {
        return res.status(400).json({ error: 'A class, topic, and file are required' });
      }

      if (!(await ownsClass(classId, req.user!.id))) {
        return res.status(404).json({ error: 'Class or topic not found' });
      }
      const topic = await prisma.virtualStudyTopic.findFirst({
        where: { id: topicId, classId },
        select: { id: true, name: true },
      });
      if (!topic) return res.status(404).json({ error: 'Class or topic not found' });

      const resourceId = randomUUID();
      const uploadedFile = await uploadResourceFile(req.user!.id, resourceId, file);
      uploadedPath = uploadedFile.fileUrl;
      const fileExtension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
      const resourceType = fileExtension === '.pdf' ? 'PDF' : fileExtension === '.mp4' ? 'VIDEO' : 'NOTE';
      const classResource = await prisma.$transaction(async (transaction) => {
        await transaction.resource.create({
          data: {
            id: resourceId,
            title: uploadedFile.fileName,
            type: resourceType,
            topic: topic.name,
            visibility: 'PRIVATE',
            creatorId: req.user!.id,
            files: {
              create: {
                fileUrl: uploadedFile.fileUrl,
                fileName: uploadedFile.fileName,
                fileSize: uploadedFile.fileSize,
                mimeType: uploadedFile.mimeType,
              },
            },
          },
        });
        return transaction.virtualStudyResource.create({
          data: { topicId, resourceId },
          include: {
            resource: {
              select: {
                id: true,
                title: true,
                type: true,
                visibility: true,
                creatorId: true,
                files: { select: { id: true, fileName: true } },
              },
            },
          },
        });
      });

      res.status(201).json({ classResource });
    } catch (error) {
      if (uploadedPath) {
        try {
          
          await deleteFromCloudinary(uploadedPath);
        } catch (cleanupError) {
          console.error('Class file upload rollback failed:', cleanupError);
        }
      }
      if (error instanceof InvalidResourceFileError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Failed to add private class file:', error);
      res.status(500).json({ error: 'Unable to add this private class file' });
    }
  },
);

router.delete('/:id/topics/:topicId/resources/:classResourceId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const classId = getParam(req.params.id);
    const topicId = getParam(req.params.topicId);
    const classResourceId = getParam(req.params.classResourceId);
    if (!classId || !topicId || !classResourceId) {
      return res.status(400).json({ error: 'Missing class resource identifiers' });
    }
    if (!(await ownsClass(classId, req.user!.id))) {
      return res.status(403).json({ error: 'You can only edit your own classes' });
    }
    const reference = await prisma.virtualStudyResource.findFirst({
      where: { id: classResourceId, topicId, topic: { classId } },
      select: { id: true },
    });
    if (!reference) {
      return res.status(404).json({ error: 'Class resource not found' });
    }

    await prisma.virtualStudyResource.delete({ where: { id: classResourceId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove class resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
