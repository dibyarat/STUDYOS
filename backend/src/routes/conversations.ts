import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { Prisma, prisma } from '../lib/prisma';

const router = Router();
const messageInclude = { sender: { select: { id: true, name: true, avatarUrl: true } } };

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function contextParticipants(contextType: string, contextId: string, userId: string): Promise<string[] | null> {
  if (contextType === 'TEAM') {
    const team = await prisma.teamPost.findUnique({
      where: { id: contextId },
      include: { memberships: true },
    });
    if (!team) return null;
    const participantSet = new Set<string>();
    if (team.creatorId) participantSet.add(team.creatorId);

    const memList = (team.memberships as any[]) || [];
    for (const m of memList) {
      const uid = m.userId || m.user?.id;
      if (uid) participantSet.add(uid);
    }

    const directMems = await prisma.teamMembership.findMany({
      where: { OR: [{ teamId: contextId }, { teamPostId: contextId }] },
    });
    for (const m of directMems) {
      if (m.userId) participantSet.add(m.userId);
    }

    if (!participantSet.has(userId)) return null;
    return Array.from(participantSet);
  }

  if (contextType === 'HELP_REQUEST') {
    const request = await prisma.helpRequest.findUnique({ where: { id: contextId } });
    if (!request || ![request.requesterId, request.providerId].includes(userId)) return null;
    if (!['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status)) return null;
    return [request.requesterId, request.providerId];
  }

  return null;
}

async function authorizeConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { where: { userId }, select: { id: true, lastReadAt: true } } },
  });
  if (!conversation) return null;
  if (conversation.contextType && conversation.contextId) {
    const participants = await contextParticipants(conversation.contextType, conversation.contextId, userId);
    if (!participants) return null;
  }
  const member = conversation.members?.[0] || { id: 'temp', lastReadAt: null };
  return { conversation, member };
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const allConversations = await prisma.conversation.findMany({
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const accessible: any[] = [];
    for (const conversation of allConversations) {
      let member = conversation.members?.find((m: any) => m.userId === userId);
      if (!member && conversation.contextType && conversation.contextId) {
        const participants = await contextParticipants(conversation.contextType, conversation.contextId, userId);
        if (participants?.includes(userId)) {
          member = await prisma.conversationMember.create({
            data: { conversationId: conversation.id, userId },
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          });
          if (!conversation.members) conversation.members = [];
          conversation.members.push(member);
        }
      }
      if (!member) continue;

      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: userId },
          createdAt: { gt: member.lastReadAt || new Date(0) },
        },
      });
      accessible.push({ ...conversation, unreadCount });
    }

    res.json({ conversations: accessible });
  } catch (error) {
    console.error('Failed to list conversations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/open', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const contextType = String(req.body?.contextType || '').toUpperCase();
    const contextId = String(req.body?.contextId || '').trim();
    if (!contextId || !['TEAM', 'HELP_REQUEST'].includes(contextType)) {
      return res.status(400).json({ error: 'A valid team or help request context is required' });
    }

    const participantIds = await contextParticipants(contextType, contextId, req.user!.id);
    if (!participantIds) return res.status(403).json({ error: 'You do not have access to this conversation context' });
    const contextKey = `${contextType}:${contextId}`;

    const conversation = await prisma.$transaction(async (transaction) => {
      const found = await transaction.conversation.findUnique({ where: { contextKey } });
      const conversation = found || await transaction.conversation.create({
        data: { contextType, contextId, contextKey },
      });
      for (const memberId of participantIds) {
        await transaction.conversationMember.upsert({
          where: { conversationId_userId: { conversationId: conversation.id, userId: memberId } },
          update: {},
          create: { conversationId: conversation.id, userId: memberId },
        });
      }
      return transaction.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: {
          members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });

    res.json({ conversation });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      return res.status(409).json({ error: 'Conversation changed; please retry' });
    }
    console.error('Failed to open conversation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    const requestedLimit = Number.parseInt(String(req.query.limit || '50'), 10);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (!id) return res.status(400).json({ error: 'Missing conversation id' });
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || (before && Number.isNaN(before.getTime()))) {
      return res.status(400).json({ error: 'Invalid message pagination' });
    }
    const access = await authorizeConversation(id, req.user!.id);
    if (!access) return res.status(403).json({ error: 'You cannot access this conversation' });

    const limit = Math.min(requestedLimit, 100);
    const messages = await prisma.message.findMany({
      where: { conversationId: id, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: messageInclude,
    });
    const hasMore = messages.length > limit;
    res.json({ messages: messages.slice(0, limit).reverse(), hasMore });
  } catch (error) {
    console.error('Failed to load conversation messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    const content = String(req.body?.content || '').trim();
    if (!id || !content || content.length > 5000) {
      return res.status(400).json({ error: 'Message content is required and must be 5000 characters or fewer' });
    }
    const access = await authorizeConversation(id, req.user!.id);
    if (!access) return res.status(403).json({ error: 'You cannot send messages in this conversation' });

    const message = await prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: { conversationId: id, senderId: req.user!.id, content },
        include: messageInclude,
      });
      await transaction.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      const recipients = await transaction.conversationMember.findMany({
        where: { conversationId: id, userId: { not: req.user!.id } },
        select: { userId: true },
      });
      if (recipients.length) {
        await transaction.notification.createMany({
          data: recipients.map(({ userId }) => ({
            recipientId: userId,
            type: 'NEW_MESSAGE',
            title: 'New message',
            message: `${String(req.user!.dbUser?.name || 'A student')} sent you a message.`,
            relatedEntityType: 'CONVERSATION',
            relatedEntityId: id,
          })),
        });
      }
      return created;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Failed to send message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing conversation id' });
    const access = await authorizeConversation(id, req.user!.id);
    if (!access) return res.status(403).json({ error: 'You cannot update this conversation' });
    await prisma.conversationMember.update({ where: { id: access.member.id }, data: { lastReadAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark conversation read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;