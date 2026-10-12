import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { Prisma, prisma } from '../lib/prisma';

const router = Router();
const CATEGORIES = new Set(['PPT_DESIGN', 'UI_UX', 'PDF_FORMATTING', 'CODE_REVIEW', 'DEBUGGING_GUIDANCE', 'TUTORING', 'MENTORING', 'RESEARCH_GUIDANCE', 'DOCUMENTATION', 'PROJECT_GUIDANCE', 'OTHER']);
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
};

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseService(body: Record<string, unknown>, partial = false) {
  const title = body.title === undefined && partial ? undefined : String(body.title || '').trim();
  const description = body.description === undefined && partial ? undefined : String(body.description || '').trim();
  const category = body.category === undefined && partial ? undefined : String(body.category || 'OTHER').trim().toUpperCase().replace(/[\s/-]+/g, '_');
  const isPaid = body.isPaid === undefined && partial ? undefined : Boolean(body.isPaid ?? (body.paymentType === 'PAID'));
  const price = body.price === undefined && partial ? undefined : body.price == null || body.price === '' ? null : Number(body.price);
  const paymentMethod = body.paymentMethod === undefined && partial ? undefined : String(body.paymentMethod || '').toUpperCase() || null;
  const skills = body.skills === undefined && partial ? undefined : String(body.skills || '').trim() || null;
  const deliverables = body.deliverables === undefined && partial ? undefined : String(body.deliverables || '').trim() || null;
  const availability = body.availability === undefined && partial ? undefined : String(body.availability || '').trim() || null;
  const preferredSchedule = body.preferredSchedule === undefined && partial ? undefined : String(body.preferredSchedule || '').trim() || null;
  const responseTime = body.responseTime === undefined && partial ? undefined : String(body.responseTime || '').trim() || null;
  const expectedTimeline = body.expectedTimeline === undefined && partial ? undefined : String(body.expectedTimeline || '').trim() || null;
  const upiId = body.upiId === undefined && partial ? undefined : String(body.upiId || '').trim() || null;
  const paymentQrUrl = body.paymentQrUrl === undefined && partial ? undefined : String(body.paymentQrUrl || '').trim() || null;
  const paymentInstructions = body.paymentInstructions === undefined && partial ? undefined : String(body.paymentInstructions || '').trim() || null;

  if (title !== undefined && (!title || title.length > 160)) throw new Error('Title is required and must be 160 characters or fewer');
  if (description && description.length > 5000) throw new Error('Description is too long');
  if (category !== undefined && !CATEGORIES.has(category)) throw new Error('Unsupported help category');
  if (skills && skills.length > 1000) throw new Error('Skills are too long');
  if (deliverables && deliverables.length > 2000) throw new Error('Expected deliverables are too long');
  if (availability && availability.length > 500) throw new Error('Availability is too long');
  if (preferredSchedule && preferredSchedule.length > 300) throw new Error('Preferred schedule is too long');
  if (responseTime && responseTime.length > 200) throw new Error('Expected response time is too long');
  if (expectedTimeline && expectedTimeline.length > 300) throw new Error('Expected timeline is too long');
  if (price !== undefined && price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Price must be zero or more');
  if (paymentMethod !== undefined && paymentMethod !== null && !['UPI', 'CASH'].includes(paymentMethod)) throw new Error('Payment method must be UPI or CASH');
  if (isPaid === false && (paymentMethod || upiId || paymentQrUrl || paymentInstructions)) throw new Error('Free services cannot include payment details');

  return { title, description, category, isPaid, price, paymentMethod, skills, deliverables, availability, preferredSchedule, responseTime, expectedTimeline, upiId, paymentQrUrl, paymentInstructions };
}

function prismaConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code);
}

const serviceInclude = {
  provider: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { requests: true, reviews: true } },
};

router.get('/', requireAuth, async (_req, res) => {
  try {
    const services = await prisma.helpService.findMany({
      include: serviceInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const aggregates = await prisma.serviceReview.groupBy({
      by: ['serviceId'],
      where: { serviceId: { in: services.map((service) => service.id) } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const byServiceId = new Map(aggregates.map((item) => [item.serviceId, item]));
    res.json({ jobs: services.map((service) => ({
      ...service,
      averageRating: byServiceId.get(service.id)?._avg.rating || 0,
      ratingCount: byServiceId.get(service.id)?._count.rating || 0,
    })) });
  } catch (error) {
    console.error('Failed to list help services:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requests = await prisma.helpRequest.findMany({
      where: { OR: [{ requesterId: req.user!.id }, { providerId: req.user!.id }] },
      include: {
        service: { select: { id: true, title: true, category: true, isPaid: true, price: true } },
        requester: { select: { id: true, name: true, avatarUrl: true } },
        provider: { select: { id: true, name: true, avatarUrl: true } },
        review: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ requests });
  } catch (error) {
    console.error('Failed to list help requests:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    let input;
    try {
      input = parseService(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid help service' });
    }
    const helpService = await prisma.helpService.create({
      data: {
        title: input.title!,
        description: input.description || null,
        category: input.category || 'OTHER',
        isPaid: input.isPaid || false,
        price: input.isPaid ? input.price ?? null : null,
        paymentMethod: input.isPaid ? input.paymentMethod || null : null,
        upiId: input.isPaid && input.paymentMethod === 'UPI' ? input.upiId || null : null,
        paymentQrUrl: input.isPaid && input.paymentMethod === 'UPI' ? input.paymentQrUrl || null : null,
        paymentInstructions: input.isPaid ? input.paymentInstructions || null : null,
        skills: input.skills || null,
        deliverables: input.deliverables || null,
        availability: input.availability || null,
        preferredSchedule: input.preferredSchedule || null,
        responseTime: input.responseTime || null,
        expectedTimeline: input.expectedTimeline || null,
        providerId: req.user!.id,
      },
      include: serviceInclude,
    });
    res.status(201).json({ helpService });
  } catch (error) {
    console.error('Failed to create help service:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing help service id' });
    const existing = await prisma.helpService.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Help service not found' });
    if (existing.providerId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own help services' });
    let input;
    try {
      input = parseService(req.body || {}, true);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid help service' });
    }
    const isPaid = input.isPaid ?? existing.isPaid;
    const paymentMethod = input.paymentMethod === undefined ? existing.paymentMethod : input.paymentMethod;
    const helpService = await prisma.helpService.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        isPaid,
        price: isPaid ? input.price === undefined ? existing.price : input.price : null,
        paymentMethod: isPaid ? paymentMethod : null,
        upiId: isPaid && paymentMethod === 'UPI' ? input.upiId === undefined ? existing.upiId : input.upiId : null,
        paymentQrUrl: isPaid && paymentMethod === 'UPI' ? input.paymentQrUrl === undefined ? existing.paymentQrUrl : input.paymentQrUrl : null,
        paymentInstructions: isPaid ? input.paymentInstructions === undefined ? existing.paymentInstructions : input.paymentInstructions : null,
        skills: input.skills,
        deliverables: input.deliverables,
        availability: input.availability,
        preferredSchedule: input.preferredSchedule,
        responseTime: input.responseTime,
        expectedTimeline: input.expectedTimeline,
      },
      include: serviceInclude,
    });
    res.json({ helpService });
  } catch (error) {
    console.error('Failed to update help service:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing help service id' });
    const service = await prisma.helpService.findUnique({ where: { id }, select: { providerId: true } });
    if (!service) return res.status(404).json({ error: 'Help service not found' });
    if (service.providerId !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own help services' });
    await prisma.helpService.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete help service:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

async function createHelpRequest(req: AuthenticatedRequest, res: Parameters<Parameters<typeof router.post>[1]>[1], serviceId: string): Promise<void> {
  try {
    const message = String(req.body?.message || '').trim();
    const triedSoFar = String(req.body?.triedSoFar || '').trim();
    const projectContext = String(req.body?.projectContext || '').trim();
    const expectedOutcome = String(req.body?.expectedOutcome || '').trim();
    const communicationMethod = String(req.body?.communicationMethod || '').trim();
    const preferredDate = req.body?.preferredDate ? new Date(String(req.body.preferredDate)) : null;
    if (message.length > 4000 || triedSoFar.length > 2000 || projectContext.length > 1000 || expectedOutcome.length > 1200 || communicationMethod.length > 100 || (preferredDate && Number.isNaN(preferredDate.getTime()))) {
      res.status(400).json({ error: 'Help request details are invalid or too long' });
      return;
    }
    const helpRequest = await prisma.$transaction(async (transaction) => {
      const service = await transaction.helpService.findUnique({ where: { id: serviceId } });
      if (!service) throw new Error('NOT_FOUND');
      if (service.providerId === req.user!.id) throw new Error('OWN_SERVICE');

      const existing = await transaction.helpRequest.findUnique({
        where: { requesterId_serviceId: { requesterId: req.user!.id, serviceId } },
      });
      if (existing && !['CANCELLED', 'REJECTED'].includes(existing.status)) throw new Error('DUPLICATE_REQUEST');

      const request = existing
        ? await transaction.helpRequest.update({
            where: { id: existing.id },
            data: {
              status: 'PENDING',
              message: message || 'Help requested via StudyOS',
              triedSoFar: triedSoFar || null,
              projectContext: projectContext || null,
              expectedOutcome: expectedOutcome || null,
              preferredDate,
              communicationMethod: communicationMethod || null,
            },
          })
        : await transaction.helpRequest.create({
            data: {
              serviceId,
              requesterId: req.user!.id,
              providerId: service.providerId,
              status: 'PENDING',
              message: message || 'Help requested via StudyOS',
              triedSoFar: triedSoFar || null,
              projectContext: projectContext || null,
              expectedOutcome: expectedOutcome || null,
              preferredDate,
              communicationMethod: communicationMethod || null,
            },
          });

      await transaction.notification.create({
        data: {
          recipientId: service.providerId,
          type: 'HELP_REQUEST',
          title: 'New help request',
          message: `${String(req.user!.dbUser?.name || 'A student')} requested help with ${service.title}.`,
          relatedEntityType: 'HELP_REQUEST',
          relatedEntityId: request.id,
        },
      });
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    res.status(201).json({ helpRequest });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Help service not found' });
      return;
    }
    if (error instanceof Error && error.message === 'OWN_SERVICE') {
      res.status(403).json({ error: 'You cannot request your own service' });
      return;
    }
    if ((error instanceof Error && error.message === 'DUPLICATE_REQUEST') || prismaConflict(error)) {
      res.status(409).json({ error: 'An active request already exists for this service' });
      return;
    }
    console.error('Failed to create help request:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

router.post('/:id/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  const id = getParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Missing help service id' });
  await createHelpRequest(req, res, id);
});

router.post('/:id/claim', requireAuth, async (req: AuthenticatedRequest, res) => {
  const id = getParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Missing help service id' });
  await createHelpRequest(req, res, id);
});

router.patch('/requests/:requestId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requestId = getParam(req.params.requestId);
    const nextStatus = String(req.body?.status || '').toUpperCase();
    if (!requestId || !nextStatus) return res.status(400).json({ error: 'Request id and status are required' });

    const helpRequest = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.helpRequest.findUnique({
        where: { id: requestId },
        include: {
          service: { select: { title: true } },
          requester: { select: { name: true } },
          provider: { select: { name: true } },
        },
      });
      if (!existing) throw new Error('NOT_FOUND');

      const isProvider = existing.providerId === req.user!.id;
      const isRequester = existing.requesterId === req.user!.id;

      // Idempotency: repeated clicks for current status return cleanly
      if (existing.status === nextStatus) {
        if (nextStatus === 'ACCEPTED') {
          const contextKey = `HELP_REQUEST:${existing.id}`;
          const conversation = await transaction.conversation.upsert({
            where: { contextKey },
            update: {},
            create: { contextType: 'HELP_REQUEST', contextId: existing.id, contextKey },
          });
          await transaction.conversationMember.createMany({
            data: [existing.requesterId, existing.providerId].map((userId) => ({ conversationId: conversation.id, userId })),
            skipDuplicates: true,
          });
        }
        return existing;
      }

      // Role and transition verification
      if (nextStatus === 'ACCEPTED' || nextStatus === 'REJECTED') {
        if (!isProvider) throw new Error('PROVIDER_ONLY');
        if (existing.status !== 'PENDING') throw new Error('INVALID_TRANSITION');
      } else if (nextStatus === 'CANCELLED') {
        if (!isRequester && !isProvider) throw new Error('FORBIDDEN');
        if (existing.status !== 'PENDING') throw new Error('INVALID_TRANSITION');
      } else if (['IN_PROGRESS', 'COMPLETED'].includes(nextStatus)) {
        if (!isProvider) throw new Error('PROVIDER_ONLY');
        if (!(TRANSITIONS[existing.status] || []).includes(nextStatus)) throw new Error('INVALID_TRANSITION');
      } else {
        throw new Error('INVALID_STATUS');
      }

      const updated = await transaction.helpRequest.update({ where: { id: requestId }, data: { status: nextStatus } });
      if (nextStatus === 'ACCEPTED') {
        const contextKey = `HELP_REQUEST:${existing.id}`;
        const conversation = await transaction.conversation.upsert({
          where: { contextKey },
          update: {},
          create: { contextType: 'HELP_REQUEST', contextId: existing.id, contextKey },
        });
        await transaction.conversationMember.createMany({
          data: [existing.requesterId, existing.providerId].map((userId) => ({ conversationId: conversation.id, userId })),
          skipDuplicates: true,
        });
      }
      const recipientId = req.user!.id === existing.providerId ? existing.requesterId : existing.providerId;
      const eventText: Record<string, string> = {
        ACCEPTED: 'accepted',
        REJECTED: 'declined',
        IN_PROGRESS: 'started',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
      };
      const actorName = String(req.user!.dbUser?.name || (req.user!.id === existing.providerId ? existing.provider?.name : existing.requester?.name) || 'A student');
      const serviceTitle = existing.service?.title || 'a service';
      await transaction.notification.create({
        data: {
          recipientId,
          type: `HELP_${nextStatus}`,
          title: `Help request ${eventText[nextStatus]}`,
          message: `${actorName} ${eventText[nextStatus]} your help request for ${serviceTitle}.`,
          relatedEntityType: 'HELP_REQUEST',
          relatedEntityId: existing.id,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });

    res.json({ helpRequest });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Help request not found' });
    if (error instanceof Error && error.message === 'PROVIDER_ONLY') return res.status(403).json({ error: 'Only the service provider can accept or reject this request' });
    if (error instanceof Error && error.message === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot update this help request' });
    if (error instanceof Error && ['INVALID_STATUS', 'INVALID_TRANSITION'].includes(error.message)) return res.status(409).json({ error: 'Invalid help request state transition' });
    if (prismaConflict(error)) return res.status(409).json({ error: 'Help request changed; refresh and try again' });
    console.error('Failed to update help request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/requests/:requestId/review', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requestId = getParam(req.params.requestId);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    if (!requestId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'A rating from 1 to 5 is required' });
    }
    if (comment.length > 2000) return res.status(400).json({ error: 'Review comment is too long' });

    const review = await prisma.$transaction(async (transaction) => {
      const request = await transaction.helpRequest.findUnique({
        where: { id: requestId },
        include: { provider: { select: { name: true } }, service: { select: { title: true } } },
      });
      if (!request) throw new Error('NOT_FOUND');
      if (request.requesterId !== req.user!.id) throw new Error('FORBIDDEN');
      if (request.status !== 'COMPLETED' || !request.serviceId) throw new Error('NOT_COMPLETED');
      if (request.requesterId === request.providerId) throw new Error('SELF_REVIEW');
      const created = await transaction.serviceReview.create({
        data: {
          helpRequestId: request.id,
          serviceId: request.serviceId,
          reviewerId: request.requesterId,
          providerId: request.providerId,
          rating,
          comment: comment || null,
        },
      });
      await transaction.notification.create({
        data: {
          recipientId: request.providerId,
          type: 'HELP_REVIEW',
          title: 'New help service rating',
          message: `${String(req.user!.dbUser?.name || 'A student')} reviewed your completed help session for ${request.service?.title || 'a service'}.`,
          relatedEntityType: 'HELP_REQUEST',
          relatedEntityId: request.id,
        },
      });
      return created;
    });
    res.status(201).json({ review });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Help request not found' });
    if (error instanceof Error && error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Only the requester can review this interaction' });
    if (error instanceof Error && error.message === 'NOT_COMPLETED') return res.status(409).json({ error: 'Only completed requests can be rated' });
    if (error instanceof Error && error.message === 'SELF_REVIEW') return res.status(403).json({ error: 'You cannot review your own help service' });
    if (prismaConflict(error)) return res.status(409).json({ error: 'This help request has already been rated' });
    console.error('Failed to create help review:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
