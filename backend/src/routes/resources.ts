import { Router } from 'express';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { Prisma, prisma } from '../lib/prisma';
import { InvalidResourceFileError, uploadResourceFile } from '../lib/storage';
import { deleteFromCloudinary, buildAttachmentUrl } from '../lib/cloudinary';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleResourceUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Files must be 10 MB or smaller' });
    }
    console.error('Failed to read resource file upload:', error);
    return res.status(400).json({ error: 'Unable to read the uploaded file' });
  });
}

function normalizeTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof rawTags === 'string') {
    return rawTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}


router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const resources = await prisma.resource.findMany({
      where: {
        OR: [
          { visibility: 'PUBLIC' },
          { creatorId: req.user!.id },
        ],
      },
      include: {
        creator: {
          select: { id: true, name: true, avatarUrl: true },
        },
        files: true,
        tags: { select: { tag: true } },
        saves: { where: { userId: req.user!.id }, select: { userId: true } },
        _count: { select: { saves: true, ratings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ resources: resources.map((resource) => ({ ...resource, savedByUser: resource.saves.length > 0 })) });
  } catch (error) {
    console.error('Failed to list resources:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/files/:fileId/access', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
    if (!id || !fileId) {
      return res.status(400).json({ error: 'Missing resource or file id' });
    }

    const file = await prisma.resourceFile.findFirst({
      where: { id: fileId, resourceId: id },
      include: { resource: { select: { creatorId: true, visibility: true } } },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    const resource = file.resource || await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    const downloadUrl = buildAttachmentUrl(file.fileUrl, file.fileName);
    res.json({ url: downloadUrl, fileName: file.fileName, expiresIn: 300 });
    return;
  } catch (error) {
    console.error('Failed to create resource file link:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }
    const authUserId = req.user?.id;
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        files: true,
        tags: { select: { tag: true } },
        saves: authUserId ? { where: { userId: authUserId }, select: { userId: true } } : false,
        ratings: authUserId ? { where: { userId: authUserId }, select: { userId: true, rating: true } } : false,
        _count: { select: { saves: true, ratings: true } },
      },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const isOwner = authUserId === resource.creatorId;
    if (resource.visibility === 'PRIVATE' && !isOwner) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    res.json({ resource });
  } catch (error) {
    console.error('Failed to fetch resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/save', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    const saved = await prisma.resourceSave.upsert({
      where: {
        userId_resourceId: {
          userId: req.user!.id,
          resourceId: id,
        },
      },
      update: {},
      create: {
        userId: req.user!.id,
        resourceId: id,
      },
    });

    res.status(201).json({ saved, savedByUser: true });
  } catch (error) {
    console.error('Failed to save resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing resource id' });

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    const comments = await prisma.resourceComment.findMany({
      where: { resourceId: id },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ comments });
  } catch (error) {
    console.error('Failed to list resource comments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing resource id' });

    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Comment content is required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    const comment = await prisma.resourceComment.create({
      data: {
        resourceId: id,
        authorId: req.user!.id,
        content,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (resource.creatorId !== req.user!.id) {
      await prisma.notification.create({
        data: {
          recipientId: resource.creatorId,
          type: 'RESOURCE_COMMENT',
          title: 'New discussion comment',
          message: `A student commented on "${resource.title}".`,
          relatedEntityType: 'RESOURCE',
          relatedEntityId: id,
        },
      }).catch(() => null);
    }

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Failed to create resource comment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/comments/:commentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const commentId = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
    if (!id || !commentId) return res.status(400).json({ error: 'Missing parameters' });

    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Comment content is required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });

    const existing = await prisma.resourceComment.findUnique({ where: { id: commentId } });
    if (!existing || existing.resourceId !== id) return res.status(404).json({ error: 'Comment not found' });
    if (existing.authorId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own comments' });

    const updated = await prisma.resourceComment.update({
      where: { id: commentId },
      data: { content },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    res.json({ comment: updated });
  } catch (error) {
    console.error('Failed to update comment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const commentId = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
    if (!id || !commentId) return res.status(400).json({ error: 'Missing parameters' });

    const resource = await prisma.resource.findUnique({ where: { id } });
    const existing = await prisma.resourceComment.findUnique({ where: { id: commentId } });
    if (!existing || existing.resourceId !== id) return res.status(404).json({ error: 'Comment not found' });

    const isAuthor = existing.authorId === req.user!.id;
    const isResourceOwner = resource?.creatorId === req.user!.id;
    if (!isAuthor && !isResourceOwner) {
      return res.status(403).json({ error: 'You are not authorized to delete this comment' });
    }

    await prisma.resourceComment.delete({ where: { id: commentId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/save', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }

    const resource = await prisma.resource.findUnique({ where: { id }, select: { creatorId: true, visibility: true } });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    await prisma.resourceSave.delete({
      where: {
        userId_resourceId: {
          userId: req.user!.id,
          resourceId: id,
        },
      },
    }).catch(() => null);

    res.json({ success: true, savedByUser: false });
  } catch (error) {
    console.error('Failed to unsave resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/rate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }

    const ratingValue = Number(req.body?.rating ?? 0);
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }

    const { rating, averageRating, ratingCount } = await prisma.$transaction(async (transaction) => {
      const existingRating = await transaction.resourceRating.findFirst({
        where: { userId: req.user!.id, resourceId: id },
        select: { id: true },
      });
      const rating = await transaction.resourceRating.upsert({
        where: { userId_resourceId: { userId: req.user!.id, resourceId: id } },
        update: { rating: ratingValue },
        create: { userId: req.user!.id, resourceId: id, rating: ratingValue },
      });
      if (!existingRating && resource.creatorId !== req.user!.id) {
        await transaction.notification.create({
          data: {
            recipientId: resource.creatorId,
            type: 'RESOURCE_RATING',
            title: 'Your resource received a rating',
            message: 'A student rated one of your resources.',
            relatedEntityType: 'RESOURCE',
            relatedEntityId: id,
          },
        });
      }
      let averageRating = ratingValue;
      let ratingCount = 1;
      try {
        const aggregate = await transaction.resourceRating.aggregate({
          where: { resourceId: id },
          _avg: { rating: true },
          _count: { rating: true },
        });
        if (aggregate && aggregate._avg && typeof aggregate._avg.rating === 'number') {
          averageRating = Number((aggregate._avg.rating || 0).toFixed(2));
          ratingCount = aggregate._count?.rating || 1;
        } else {
          const allRatings = await transaction.resourceRating.findMany({ where: { resourceId: id } });
          ratingCount = allRatings.length;
          const sum = allRatings.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0);
          averageRating = ratingCount > 0 ? Number((sum / ratingCount).toFixed(2)) : ratingValue;
        }
      } catch (aggErr) {
        console.warn('aggregate error in rating route, fallback to findMany:', aggErr);
        const allRatings = await transaction.resourceRating.findMany({ where: { resourceId: id } });
        ratingCount = allRatings.length;
        const sum = allRatings.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0);
        averageRating = ratingCount > 0 ? Number((sum / ratingCount).toFixed(2)) : ratingValue;
      }
      return {
        rating,
        averageRating,
        ratingCount,
      };
    });
    res.json({ rating, averageRating, ratingCount });
  } catch (error) {
    console.error('Failed to rate resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/report', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }

    const reason = String(req.body?.reason || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const description = String(req.body?.description || '').trim();
    const reasons = new Set(['INCORRECT', 'BROKEN', 'SPAM', 'COPYRIGHT', 'MISLEADING', 'OTHER']);
    if (!reasons.has(reason)) return res.status(400).json({ error: 'Choose a valid report reason' });
    if (description.length > 2000) return res.status(400).json({ error: 'Report details are too long' });

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (resource.visibility !== 'PUBLIC' && resource.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'This resource is private' });
    }
    if (resource.creatorId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot report your own resource' });
    }

    const report = await prisma.$transaction(async (transaction) => {
      const report = await transaction.resourceReport.create({
        data: { userId: req.user!.id, resourceId: id, reason, description: description || null },
      });
      await transaction.notification.create({
        data: {
          recipientId: resource.creatorId,
          type: 'RESOURCE_REPORT',
          title: 'A resource was reported',
          message: 'One of your resources was reported for review.',
          relatedEntityType: 'RESOURCE',
          relatedEntityId: id,
        },
      });
      return report;
    });

    res.status(201).json({ report });
  } catch (error) {
    console.error('Failed to report resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, handleResourceUpload, async (req: AuthenticatedRequest, res) => {
  let uploadedObjectPath: string | null = null;
  let resourceCreated = false;

  try {
    const { title, description, type, subject, topic, visibility } = req.body || {};
    const uploadedFile = req.file;
    const tags = normalizeTags(req.body?.tags);

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const safeTitle = String(title || '').trim();
    if (!safeTitle) {
      return res.status(400).json({ error: 'Resource title is required' });
    }

    const resourceId = randomUUID();
    let uploadedFileMetadata: { fileUrl: string; fileName: string; mimeType: string; fileSize: number } | null = null;

    if (uploadedFile) {
      try {
        uploadedFileMetadata = await uploadResourceFile(req.user.id, resourceId, uploadedFile);
        uploadedObjectPath = uploadedFileMetadata.fileUrl;
      } catch (error) {
        console.error('Resource upload failed:', error);
        if (error instanceof InvalidResourceFileError) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(400).json({ error: 'File upload failed or storage is unavailable' });
      }
    }

    const payload: Prisma.ResourceCreateInput = {
      id: resourceId,
      title: safeTitle,
      description: description || null,
      type: type || 'NOTE',
      subject: subject || null,
      topic: topic || null,
      visibility: visibility || 'PRIVATE',
      creator: { connect: { id: req.user.id } },
    };

    if (uploadedFileMetadata) {
      payload.files = {
        create: {
          fileUrl: uploadedFileMetadata.fileUrl,
          fileName: uploadedFileMetadata.fileName,
          fileSize: uploadedFileMetadata.fileSize,
          mimeType: uploadedFileMetadata.mimeType,
        },
      };
    }

    if (tags.length > 0) {
      payload.tags = {
        create: tags.map((tag) => ({ tag: String(tag).trim() })).filter((tag) => tag.tag.length > 0),
      };
    }

    const resource = await prisma.resource.create({
      data: payload,
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        files: true,
        tags: { select: { tag: true } },
      },
    });
    resourceCreated = true;

    res.status(201).json({ resource });
  } catch (error) {
    if (uploadedObjectPath && !resourceCreated) {
      
      try {
        await deleteFromCloudinary(uploadedObjectPath);
      } catch (cleanupError) {
        console.error('Resource upload rollback failed:', cleanupError);
      }
    }
    console.error('Failed to create resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }
    const authUserId = req.user?.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const existing = await prisma.resource.findUnique({ where: { id }, include: { files: { select: { fileUrl: true } } } });
    if (!existing) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (existing.creatorId !== authUserId) {
      return res.status(403).json({ error: 'You can only edit your own resources' });
    }

    const { title, description, type, subject, topic, visibility, tags, price, paymentMethod, upiId, paymentInstructions } = req.body || {};
    const nextPrice = price === undefined ? existing.price : price === null || price === '' ? null : Number(price);
    const nextPaymentMethod = paymentMethod === undefined ? existing.paymentMethod : String(paymentMethod || '').trim().toUpperCase() || null;
    if (nextPrice !== null && (!Number.isFinite(nextPrice) || nextPrice < 0)) {
      return res.status(400).json({ error: 'Price must be zero or more' });
    }
    if (nextPaymentMethod !== null && !['UPI', 'CASH'].includes(nextPaymentMethod)) {
      return res.status(400).json({ error: 'Payment method must be UPI or CASH' });
    }
    const resource = await prisma.resource.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        description: description ?? existing.description,
        type: type ?? existing.type,
        subject: subject ?? existing.subject,
        topic: topic ?? existing.topic,
        visibility: visibility ?? existing.visibility,
        price: nextPrice,
        paymentMethod: nextPaymentMethod,
        upiId: upiId === undefined ? existing.upiId : String(upiId || '').trim() || null,
        paymentInst: paymentInstructions === undefined ? existing.paymentInst : String(paymentInstructions || '').trim() || null,
        tags: tags && Array.isArray(tags)
          ? {
              deleteMany: {},
              create: tags.map((tag: string) => ({ tag: String(tag).trim() })).filter((tag) => tag.tag.length > 0),
            }
          : undefined,
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        files: true,
        tags: { select: { tag: true } },
      },
    });

    res.json({ resource });
  } catch (error) {
    console.error('Failed to update resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/files/:fileId', requireAuth, handleResourceUpload, async (req: AuthenticatedRequest, res) => {
  let uploadedPath: string | null = null;
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const fileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
    const uploadedFile = req.file;
    if (!id || !fileId || !uploadedFile) {
      return res.status(400).json({ error: 'A resource, file, and replacement file are required' });
    }

    const resource = await prisma.resource.findUnique({ where: { id }, select: { creatorId: true } });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.creatorId !== req.user!.id) return res.status(403).json({ error: 'You can only replace files on your own resources' });

    const existingFile = await prisma.resourceFile.findFirst({
      where: { id: fileId, resourceId: id },
      select: { id: true, fileUrl: true },
    });
    if (!existingFile) return res.status(404).json({ error: 'Resource file not found' });

    const replacement = await uploadResourceFile(req.user!.id, id, uploadedFile);
    uploadedPath = replacement.fileUrl;
    const file = await prisma.resourceFile.update({
      where: { id: fileId },
      data: replacement,
    });

    if (existingFile.fileUrl) {
        try {
          await deleteFromCloudinary(existingFile.fileUrl);
        } catch (error) {
        console.error('Resource file replacement cleanup failed:', error);
      }
    }
    res.json({ file });
  } catch (error) {
    if (uploadedPath) {
      
      try {
        await deleteFromCloudinary(uploadedPath);
      } catch (cleanupError) {
        console.error('Failed to clean up an incomplete resource file replacement:', cleanupError);
      }
    }
    console.error('Failed to replace resource file:', error);
    if (error instanceof InvalidResourceFileError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Unable to replace resource file' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource id' });
    }
    const authUserId = req.user?.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const existing = await prisma.resource.findUnique({ where: { id }, include: { files: { select: { fileUrl: true } } } });
    if (!existing) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (existing.creatorId !== authUserId) {
      return res.status(403).json({ error: 'You can only delete your own resources' });
    }

    await prisma.resource.delete({ where: { id } });
    
    const objectPaths = existing.files.map((file) => file.fileUrl).filter(Boolean);
      if (objectPaths.length) {
        try {
          await Promise.all(objectPaths.map(p => deleteFromCloudinary(p)));
        } catch (error) {
        console.error('Resource files cleanup failed after deletion:', error);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete resource:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
