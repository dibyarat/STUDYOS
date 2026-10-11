import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const recipientId = req.user!.id;
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { recipientId, isRead: false } }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Failed to load notifications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { recipientId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notifications read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing notification id' });
    }

    const result = await prisma.notification.updateMany({
      where: { id, recipientId: req.user!.id },
      data: { isRead: true },
    });
    if (!result.count) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
