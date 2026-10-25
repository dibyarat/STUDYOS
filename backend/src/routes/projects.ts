import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { sensitiveLimiter, uploadLimiter } from '../middleware/rate-limit';
import multer from 'multer';
import { uploadResourceFile, InvalidResourceFileError } from '../lib/storage';
import { deleteFromCloudinary, buildAttachmentUrl, buildCleanPreviewUrl } from '../lib/cloudinary';
import { streamAuthorizedDownload } from '../lib/fileDownload';
import { randomUUID } from 'node:crypto';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const ALLOWED_CATEGORIES = new Set([
  'WEB_APP', 'MOBILE_APP', 'ML_AI', 'DATA_SCIENCE', 'EMBEDDED', 'GAME', 'API', 'LIBRARY', 'RESEARCH', 'COLLEGE_PROJECT', 'OTHER'
]);

// Projects

// GET / - List projects
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { visibility: 'PUBLIC' },
          { creatorId: userId },
        ],
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        tags: true,
        files: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ projects });
  } catch (error) {
    console.error('Failed to list projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.get('/labs', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const labs = await prisma.labRecord.findMany({
      include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ labs });
  } catch (error) {
    console.error('Failed to list lab records:', error);
    res.status(500).json({ error: 'Failed to list lab records' });
  }
});

// GET /:id - Get single project
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const projectId = getParam(req.params.id);

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        tags: true,
        files: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.visibility !== 'PUBLIC' && project.creatorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Failed to get project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// POST / - Create project
router.post('/', requireAuth, uploadLimiter, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let data;
    try {
      data = JSON.parse(req.body.data || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid data payload' });
    }

    const { title, description, category, technology, githubUrl, demoUrl, visibility, tags } = data;

    if (!title || typeof title !== 'string' || title.length > 160) {
      return res.status(400).json({ error: 'Title is required and must be max 160 characters' });
    }
    if (description && (typeof description !== 'string' || description.length > 5000)) {
      return res.status(400).json({ error: 'Description must be max 5000 characters' });
    }
    if (!category || !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (technology && (typeof technology !== 'string' || technology.length > 500)) {
      return res.status(400).json({ error: 'Technology must be max 500 characters' });
    }
    if (githubUrl && !/^https:\/\//.test(githubUrl)) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }
    if (demoUrl && !/^https:\/\//.test(demoUrl)) {
      return res.status(400).json({ error: 'Invalid Demo URL' });
    }
    if (visibility && !['PUBLIC', 'PRIVATE'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be PUBLIC or PRIVATE' });
    }

    const tagArray = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [];

    const project = await prisma.project.create({
      data: {
        title,
        description: description || null,
        category,
        technology: technology || null,
        githubUrl: githubUrl || null,
        demoUrl: demoUrl || null,
        visibility: visibility || 'PUBLIC',
        creatorId: userId,
        tags: {
          create: tagArray.map((tag) => ({ tag })),
        },
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        tags: true,
        files: true,
      },
    });

    if (req.file) {
      try {
        const uploadedFile = await uploadResourceFile(userId, project.id, req.file);

        const projectFile = await prisma.projectFile.create({
          data: {
            projectId: project.id,
            fileUrl: uploadedFile.fileUrl,
            fileName: uploadedFile.fileName,
          },
        });

        project.files.push(projectFile);
      } catch (uploadError) {
        console.error('Failed to upload initial project file:', uploadError);
      }
    }

    res.status(201).json({ project });
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /:id - Update project
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = getParam(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Project ID required' });

    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (existingProject.creatorId !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this project' });
    }

    const { title, description, category, technology, githubUrl, demoUrl, visibility, tags } = req.body;

    if (title !== undefined && (typeof title !== 'string' || title.length > 160 || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Title must be valid and max 160 characters' });
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 5000)) {
      return res.status(400).json({ error: 'Description must be max 5000 characters' });
    }
    if (category !== undefined && !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (technology !== undefined && (typeof technology !== 'string' || technology.length > 500)) {
      return res.status(400).json({ error: 'Technology must be max 500 characters' });
    }
    if (githubUrl !== undefined && githubUrl !== null && !/^https:\/\//.test(githubUrl)) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }
    if (demoUrl !== undefined && demoUrl !== null && !/^https:\/\//.test(demoUrl)) {
      return res.status(400).json({ error: 'Invalid Demo URL' });
    }
    if (visibility !== undefined && !['PUBLIC', 'PRIVATE'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be PUBLIC or PRIVATE' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (technology !== undefined) updateData.technology = technology;
    if (githubUrl !== undefined) updateData.githubUrl = githubUrl;
    if (demoUrl !== undefined) updateData.demoUrl = demoUrl;
    if (visibility !== undefined) updateData.visibility = visibility;

    const project = await prisma.$transaction(async (tx) => {
      if (tags && Array.isArray(tags)) {
        await tx.projectTag.deleteMany({ where: { projectId } });
        await tx.projectTag.createMany({
          data: tags.filter((t) => typeof t === 'string').map((tag) => ({
            projectId,
            tag,
          })),
        });
      }

      return tx.project.update({
        where: { id: projectId },
        data: updateData,
        include: {
          creator: { select: { id: true, name: true, avatarUrl: true } },
          tags: true,
          files: true,
        },
      });
    });

    res.json({ project });
  } catch (error) {
    console.error('Failed to update project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /:id - Delete project
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = getParam(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Project ID required' });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { files: true },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.creatorId !== userId) return res.status(403).json({ error: 'Not authorized to delete' });

    // Delete files from storage
    if (project.files && project.files.length > 0) {
      try {
        
        const filePaths = project.files.map(f => f.fileUrl).filter(Boolean);
        if (filePaths.length > 0) {
          await Promise.all(filePaths.map(p => deleteFromCloudinary(p)));
        }
      } catch (storageErr) {
        console.error('Failed to delete files from storage:', storageErr);
      }
    }

    await prisma.project.delete({ where: { id: projectId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// POST /:id/files - Upload file to project
router.post('/:id/files', requireAuth, uploadLimiter, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const projectId = getParam(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Project ID required' });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.creatorId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const uploadedFile = await uploadResourceFile(userId, project.id, req.file);

    const projectFile = await prisma.projectFile.create({
      data: {
        projectId: project.id,
        fileUrl: uploadedFile.fileUrl,
        fileName: uploadedFile.fileName,
      },
    });

    res.json({ file: projectFile });
  } catch (error) {
    console.error('Failed to upload project file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// DELETE /:id/files/:fileId - Delete project file
router.delete('/:id/files/:fileId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = getParam(req.params.id);
    const fileId = getParam(req.params.fileId);
    if (!projectId || !fileId) return res.status(400).json({ error: 'Missing parameters' });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.creatorId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== projectId) return res.status(404).json({ error: 'File not found' });

    try {
      
      if (file.fileUrl) {
          await deleteFromCloudinary(file.fileUrl);
        }
    } catch (storageErr) {
      console.error('Failed to remove from storage:', storageErr);
    }

    await prisma.projectFile.delete({ where: { id: fileId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /:id/files/:fileId/access - Get signed URL for project file
router.get('/:id/files/:fileId/access', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const projectId = getParam(req.params.id);
    const fileId = getParam(req.params.fileId);
    if (!projectId || !fileId) return res.status(400).json({ error: 'Missing parameters' });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.visibility !== 'PUBLIC' && project.creatorId !== userId) {
      return res.status(403).json({ error: 'This project is private' });
    }

    const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== projectId) return res.status(404).json({ error: 'File not found' });

    const previewUrl = buildCleanPreviewUrl(file.fileUrl);
    const downloadUrl = buildAttachmentUrl(file.fileUrl, file.fileName);
    res.json({
      url: previewUrl,
      previewUrl,
      downloadUrl,
      directDownloadUrl: `/projects/${projectId}/files/${fileId}/download`,
      fileName: file.fileName,
      mimeType: file.mimeType || 'application/octet-stream',
      fileSize: file.fileSize,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('Failed to get file link:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/files/:fileId/download', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = getParam(req.params.id);
    const fileId = getParam(req.params.fileId);
    const userId = req.user!.id;
    if (!projectId || !fileId) return res.status(400).json({ error: 'Missing parameters' });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.visibility !== 'PUBLIC' && project.creatorId !== userId) {
      return res.status(403).json({ error: 'This project is private' });
    }

    const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== projectId) return res.status(404).json({ error: 'File not found' });

    await streamAuthorizedDownload(res, file.fileUrl, file.fileName, file.mimeType);
  } catch (error) {
    console.error('Failed to stream project file download:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
});


// Lab Records

router.get('/labs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const labId = getParam(req.params.id);
    if (!labId) return res.status(400).json({ error: 'Lab ID required' });

    const lab = await prisma.labRecord.findUnique({ where: { id: labId }, include: { uploader: { select: { id: true, name: true, avatarUrl: true } } } });
    if (!lab) return res.status(404).json({ error: 'Lab record not found' });

    res.json({ lab });
  } catch (error) {
    console.error('Failed to get lab record:', error);
    res.status(500).json({ error: 'Failed to get lab record' });
  }
});

router.post('/labs', requireAuth, uploadLimiter, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name || name.length > 200) return res.status(400).json({ error: 'Document name is required and must be 200 characters or fewer' });
    if (!description || description.length > 3000) return res.status(400).json({ error: 'Description is required and must be 3,000 characters or fewer' });
    if (!req.file) return res.status(400).json({ error: 'Upload a PDF, DOC, or DOCX document' });

    const id = randomUUID();
    const uploaded = await uploadResourceFile(req.user!.id, id, req.file);
    try {
      const lab = await prisma.labRecord.create({
        data: {
          id,
          name,
          description,
          fileReference: uploaded.fileUrl,
          fileName: uploaded.fileName,
          fileMimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
          uploaderId: req.user!.id,
        },
        include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
      });
      return res.status(201).json({ lab });
    } catch (error) {
      
      try {
        await deleteFromCloudinary(uploaded.fileUrl);
      } catch (cleanupError: any) {
        console.error('Failed to clean up orphaned lab document:', cleanupError.message);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof InvalidResourceFileError) return res.status(400).json({ error: error.message });
    console.error('Failed to create lab record:', error);
    res.status(500).json({ error: error instanceof Error && error.message === 'Storage is not configured' ? error.message : 'Failed to create lab record' });
  }
});

router.put('/labs/:id', requireAuth, uploadLimiter, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const labId = getParam(req.params.id);
    if (!labId) return res.status(400).json({ error: 'Lab ID required' });
    const existing = await prisma.labRecord.findUnique({ where: { id: labId } });
    if (!existing) return res.status(404).json({ error: 'Lab document not found' });
    if (existing.uploaderId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own lab documents' });
    const name = req.body?.name === undefined ? existing.name : String(req.body.name).trim();
    const description = req.body?.description === undefined ? existing.description : String(req.body.description).trim();
    if (!name || name.length > 200) return res.status(400).json({ error: 'Document name is required and must be 200 characters or fewer' });
    if (!description || description.length > 3000) return res.status(400).json({ error: 'Description is required and must be 3,000 characters or fewer' });

    const replacement = req.file ? await uploadResourceFile(req.user!.id, labId, req.file) : null;
    try {
      const lab = await prisma.labRecord.update({
        where: { id: labId },
        data: {
          name,
          description,
          ...(replacement ? {
            fileReference: replacement.fileUrl,
            fileName: replacement.fileName,
            fileMimeType: replacement.mimeType,
            fileSize: replacement.fileSize,
          } : {}),
        },
        include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
      });
      if (replacement && existing.fileReference) {
        
        try {
          await deleteFromCloudinary(existing.fileReference);
        } catch (cleanupError: any) {
          console.error('Failed to remove replaced lab document:', cleanupError.message);
        }
      }
      return res.json({ lab });
    } catch (error) {
      if (replacement) {
        
        try {
          await deleteFromCloudinary(replacement.fileUrl);
        } catch (cleanupError: any) {
          console.error('Failed to clean up replaced lab document:', cleanupError.message);
        }
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof InvalidResourceFileError) return res.status(400).json({ error: error.message });
    console.error('Failed to update lab record:', error);
    res.status(500).json({ error: error instanceof Error && error.message === 'Storage is not configured' ? error.message : 'Failed to update lab record' });
  }
});

router.delete('/labs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const labId = getParam(req.params.id);
    if (!labId) return res.status(400).json({ error: 'Lab ID required' });
    const lab = await prisma.labRecord.findUnique({ where: { id: labId } });
    if (!lab) return res.status(404).json({ error: 'Lab document not found' });
    if (lab.uploaderId !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own lab documents' });
    if (lab.fileReference) {
      
      try {
        await deleteFromCloudinary(lab.fileReference);
      } catch (removalError: any) {
        console.error('Failed to remove lab document from Storage:', removalError.message);
        return res.status(500).json({ error: 'Could not delete the stored document; the database record was preserved' });
      }
    }
    await prisma.labRecord.delete({ where: { id: labId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete lab record:', error);
    res.status(500).json({ error: 'Failed to delete lab record' });
  }
});

router.get('/labs/:id/file', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const labId = getParam(req.params.id);
    if (!labId) return res.status(400).json({ error: 'Lab ID required' });
    const lab = await prisma.labRecord.findUnique({ where: { id: labId }, select: { fileReference: true, fileName: true } });
    if (!lab?.fileReference) return res.status(404).json({ error: 'Document file not found' });
    
    const previewUrl = buildCleanPreviewUrl(lab.fileReference);
    const downloadUrl = buildAttachmentUrl(lab.fileReference, lab.fileName);
    res.json({
      url: previewUrl,
      previewUrl,
      downloadUrl,
      directDownloadUrl: `/projects/labs/${labId}/download`,
      fileName: lab.fileName,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('Failed to get lab document link:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/labs/:id/download', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const labId = getParam(req.params.id);
    if (!labId) return res.status(400).json({ error: 'Lab ID required' });
    const lab = await prisma.labRecord.findUnique({ where: { id: labId }, select: { fileReference: true, fileName: true } });
    if (!lab?.fileReference) return res.status(404).json({ error: 'Document file not found' });

    await streamAuthorizedDownload(res, lab.fileReference, lab.fileName);
  } catch (error) {
    console.error('Failed to stream lab download:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download lab file' });
    }
  }
});

export default router;
