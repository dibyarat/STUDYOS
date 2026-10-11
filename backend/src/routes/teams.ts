import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();
const TEAM_TYPES = new Set(['HACKATHON', 'GROUP_PROJECT', 'PPT_PRESENTATION', 'RESEARCH', 'COLLEGE_PROJECT', 'COMPETITION', 'OTHER']);
type TeamRole = { title: string; responsibilities: string; requiredSkills: string; openings: number };

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTeamInput(body: Record<string, unknown>, partial = false) {
  const title = body.title === undefined && partial ? undefined : String(body.title || '').trim();
  const type = body.type === undefined && partial ? undefined : String(body.type || '').trim().toUpperCase();
  const description = body.description === undefined && partial ? undefined : String(body.description || '').trim();
  const reqSkills = body.reqSkills === undefined && partial ? undefined : String(body.reqSkills || '').trim();
  const requirements = body.requirements === undefined && partial ? undefined : String(body.requirements || '').trim();
  const roles = body.roles === undefined && partial ? undefined : parseRoles(body.roles);
  const teamSize = body.teamSize === undefined && partial
    ? undefined
    : body.teamSize === null || body.teamSize === '' ? null : Number(body.teamSize);
  const deadline = body.deadline === undefined && partial
    ? undefined
    : body.deadline ? new Date(String(body.deadline)) : null;

  if (title !== undefined && (!title || title.length > 160)) throw new Error('Title is required and must be 160 characters or fewer');
  if (type !== undefined && !TEAM_TYPES.has(type)) throw new Error('Unsupported team type');
  if (description && description.length > 5000) throw new Error('Description is too long');
  if (reqSkills && reqSkills.length > 1000) throw new Error('Required skills are too long');
  if (requirements && requirements.length > 5000) throw new Error('Requirements are too long');
  if (teamSize !== undefined && teamSize !== null && (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 50)) {
    throw new Error('Team size must be an integer from 1 to 50');
  }
  if (deadline instanceof Date && Number.isNaN(deadline.getTime())) throw new Error('Deadline is invalid');
  if (deadline instanceof Date && deadline.getTime() <= Date.now()) throw new Error('Deadline must be in the future');

  if (roles && teamSize != null && roles.reduce((total, role) => total + role.openings, 0) > teamSize - 1) {
    throw new Error('Role openings cannot exceed team capacity after the creator is counted');
  }
  return { title, type, description, reqSkills, requirements, roles, teamSize, deadline };
}

function parseRoles(value: unknown): TeamRole[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 15) {
    throw new Error('Add between 1 and 15 structured roles');
  }
  const titles = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Each role must be an object');
    const role = entry as Record<string, unknown>;
    const title = String(role.title || '').trim();
    const responsibilities = String(role.responsibilities || '').trim();
    const requiredSkills = String(role.requiredSkills || '').trim();
    const openings = Number(role.openings);
    const normalizedTitle = title.toLocaleLowerCase();
    if (!title || title.length > 120 || titles.has(normalizedTitle)) throw new Error('Role titles must be unique and 1-120 characters');
    if (responsibilities.length > 2000 || requiredSkills.length > 1000) throw new Error('Role responsibilities or skills are too long');
    if (!Number.isInteger(openings) || openings < 1 || openings > 50) throw new Error('Each role needs at least one opening');
    titles.add(normalizedTitle);
    return { title, responsibilities, requiredSkills, openings };
  });
}

function getTeamRoles(value: Prisma.JsonValue | null): TeamRole[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const role = entry as Prisma.JsonObject;
    if (typeof role.title !== 'string' || typeof role.openings !== 'number') return [];
    return [{
      title: role.title,
      responsibilities: typeof role.responsibilities === 'string' ? role.responsibilities : '',
      requiredSkills: typeof role.requiredSkills === 'string' ? role.requiredSkills : '',
      openings: role.openings,
    }];
  });
}

function effectiveDeadline(team: { deadline: Date | null; createdAt: Date }): Date {
  return team.deadline || new Date(team.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function parseApplication(body: Record<string, unknown>, roles: TeamRole[]): { role: string; data: Record<string, string> } {
  const role = String(body.role || '').trim();
  const fields = ['college', 'branch', 'semesterYear', 'introduction', 'skills', 'experience', 'projects', 'motivation', 'contribution', 'responsibilities', 'availability', 'schedule'] as const;
  const data = Object.fromEntries(fields.map((field) => [field, String(body[field] || '').trim()]));
  if (!role || role.length > 120) throw new Error('Choose the role you are applying for (up to 120 characters)');
  if (!roles.some((item) => item.title === role)) throw new Error('Choose one of the roles listed for this opportunity');
  if (!data.skills || data.skills.length > 1000) throw new Error('Relevant skills are required (up to 1,000 characters)');
  if (!data.contribution || data.contribution.length > 2000) throw new Error('Describe your contribution to this project (up to 2,000 characters)');
  const limits: Record<string, number> = {
    college: 200, branch: 120, semesterYear: 80, introduction: 1200, experience: 2000, projects: 2000, motivation: 2000, responsibilities: 1200, availability: 500, schedule: 300,
  };
  for (const [field, maximum] of Object.entries(limits)) {
    if (data[field].length > maximum) throw new Error(`${field} must be ${maximum} characters or fewer`);
  }
  return { role, data };
}

const teamInclude = {
  creator: { select: { id: true, name: true, avatarUrl: true } },
  memberships: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamPosts = await prisma.teamPost.findMany({
      include: {
        ...teamInclude,
        requests: { where: { OR: [{ userId: req.user!.id }, { status: 'ACCEPTED' }] }, select: { id: true, status: true, roleAppliedFor: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ teamPosts: teamPosts.map((team) => ({
      ...team,
      deadline: effectiveDeadline(team),
      isExpired: effectiveDeadline(team).getTime() <= Date.now(),
      acceptedRoleCounts: team.memberships.reduce<Record<string, number>>((counts, membership) => {
        if (membership.position) counts[membership.position] = (counts[membership.position] || 0) + 1;
        return counts;
      }, {}),
      requests: team.requests.filter((request) => request.userId === req.user!.id).map(({ id, status }) => ({ id, status })),
    })) });
  } catch (error) {
    console.error('Failed to list team posts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/my-applications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const applications = await prisma.teamJoinRequest.findMany({
      where: { userId: req.user!.id },
      include: { team: { select: { id: true, title: true, deadline: true, createdAt: true, roles: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ applications: applications.map(({ recruiterNotes: _private, ...application }) => ({
      ...application,
      deadline: effectiveDeadline(application.team),
      isExpired: effectiveDeadline(application.team).getTime() <= Date.now(),
    })) });
  } catch (error) {
    console.error('Failed to list my team applications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing team id' });
    const teamPost = await prisma.teamPost.findUnique({
      where: { id },
      include: { ...teamInclude, requests: { where: { OR: [{ userId: req.user!.id }, { status: 'ACCEPTED' }] }, select: { id: true, status: true, roleAppliedFor: true, userId: true } } },
    });
    if (!teamPost) return res.status(404).json({ error: 'Team post not found' });
    const acceptedRoleCounts = teamPost.memberships.reduce<Record<string, number>>((counts, membership) => {
      if (membership.position) counts[membership.position] = (counts[membership.position] || 0) + 1;
      return counts;
    }, {});
    res.json({ teamPost: {
      ...teamPost,
      deadline: effectiveDeadline(teamPost),
      isExpired: effectiveDeadline(teamPost).getTime() <= Date.now(),
      acceptedRoleCounts,
      requests: teamPost.requests.filter((request) => request.userId === req.user!.id).map(({ id, status }) => ({ id, status })),
    } });
  } catch (error) {
    console.error('Failed to fetch team post:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    let input;
    try {
      input = parseTeamInput(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid team post' });
    }

    const teamPost = await prisma.teamPost.create({
      data: {
        title: input.title!,
        type: input.type!,
        description: input.description || null,
        reqSkills: input.reqSkills || null,
        requirements: input.requirements || null,
        roles: input.roles as Prisma.InputJsonValue,
        teamSize: input.teamSize ?? 4,
        deadline: input.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        creatorId: req.user!.id,
        memberships: {
          create: {
            user: { connect: { id: req.user!.id } },
            role: 'CREATOR',
          },
        },
      },
      include: teamInclude,
    });

    res.status(201).json({ teamPost });
  } catch (error) {
    console.error('Failed to create team post:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing team id' });
    let input;
    try {
      input = parseTeamInput(req.body || {}, true);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid team post' });
    }

    const existing = await prisma.teamPost.findUnique({ where: { id }, include: { memberships: { select: { position: true } }, _count: { select: { memberships: true } } } });
    if (!existing) return res.status(404).json({ error: 'Team post not found' });
    if (existing.creatorId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own team posts' });
    if (input.teamSize != null && input.teamSize < existing._count.memberships) {
      return res.status(409).json({ error: 'Team size cannot be smaller than the current membership' });
    }
    if (input.roles) {
      for (const role of input.roles) {
        const filled = existing.memberships.filter((membership) => membership.position === role.title).length;
        if (role.openings < filled) return res.status(409).json({ error: `Openings for ${role.title} cannot be lower than the number of current members` });
      }
    }

    const teamPost = await prisma.teamPost.update({
      where: { id },
      data: {
        title: input.title,
        type: input.type,
        description: input.description,
        reqSkills: input.reqSkills,
        requirements: input.requirements,
        roles: input.roles as Prisma.InputJsonValue | undefined,
        teamSize: input.teamSize,
        deadline: input.deadline === null ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : input.deadline,
      },
      include: teamInclude,
    });
    res.json({ teamPost });
  } catch (error) {
    console.error('Failed to update team post:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/repost', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing team id' });
    const existing = await prisma.teamPost.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Team post not found' });
    if (existing.creatorId !== req.user!.id) return res.status(403).json({ error: 'Only the team creator can repost this opportunity' });
    if (effectiveDeadline(existing).getTime() > Date.now()) {
      return res.status(409).json({ error: 'Only expired opportunities can be reposted' });
    }
    if (existing.teamSize != null && existing._count.memberships >= existing.teamSize) {
      return res.status(409).json({ error: 'A full team opportunity cannot be reposted' });
    }

    const teamPost = await prisma.teamPost.update({
      where: { id },
      data: { deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      include: teamInclude,
    });
    res.json({ teamPost });
  } catch (error) {
    console.error('Failed to repost team opportunity:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Missing team id' });
    const post = await prisma.teamPost.findUnique({ where: { id }, select: { creatorId: true } });
    if (!post) return res.status(404).json({ error: 'Team post not found' });
    if (post.creatorId !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own team posts' });
    await prisma.$transaction(async (transaction) => {
      await transaction.conversation.deleteMany({ where: { contextKey: `TEAM:${id}` } });
      await transaction.teamPost.delete({ where: { id } });
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete team post:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Missing team id' });
    const team = await prisma.teamPost.findUnique({ where: { id: teamId }, select: { creatorId: true } });
    if (!team) return res.status(404).json({ error: 'Team post not found' });
    if (team.creatorId !== req.user!.id) return res.status(403).json({ error: 'Only the team creator can manage requests' });
    const requests = await prisma.teamJoinRequest.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            profile: { select: { fullName: true, department: true, semester: true, avatarUrl: true } },
            academicIdentity: { select: { institution: true, branch: true, year: true, semester: true, github: true, linkedin: true, portfolio: true, isPublic: true } },
            skills: { select: { skill: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests: requests.map((request) => ({
      ...request,
      user: request.user ? {
        ...request.user,
        academicIdentity: request.user.academicIdentity?.isPublic
          ? request.user.academicIdentity
          : request.user.academicIdentity && {
            institution: request.user.academicIdentity.institution,
            branch: request.user.academicIdentity.branch,
            year: request.user.academicIdentity.year,
            semester: request.user.academicIdentity.semester,
            isPublic: false,
          },
      } : request.user,
    })) });
  } catch (error) {
    console.error('Failed to list team requests:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Missing team id' });
    let application;
    try {
      const team = await prisma.teamPost.findUnique({ where: { id: teamId }, select: { roles: true } });
      if (!team) return res.status(404).json({ error: 'Team post not found' });
      application = parseApplication(req.body || {}, getTeamRoles(team.roles));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid application' });
    }
    const result = await prisma.$transaction(async (transaction) => {
      const team = await transaction.teamPost.findUnique({ where: { id: teamId }, include: { memberships: true } });
      if (!team) throw new Error('NOT_FOUND');
      if (team.creatorId === req.user!.id) throw new Error('OWN_TEAM');
      if (team.memberships.some((member) => member.userId === req.user!.id)) throw new Error('ALREADY_MEMBER');
      if (team.teamSize != null && team.memberships.length >= team.teamSize) throw new Error('TEAM_FULL');
      if (effectiveDeadline(team).getTime() <= Date.now()) throw new Error('EXPIRED');

      const existing = await transaction.teamJoinRequest.findUnique({ where: { teamId_userId: { teamId, userId: req.user!.id } } });
      if (existing && !['WITHDRAWN', 'REJECTED'].includes(existing.status)) throw new Error('DUPLICATE_REQUEST');

      const request = existing
        ? await transaction.teamJoinRequest.update({
            where: { id: existing.id },
            data: { status: 'PENDING', roleAppliedFor: application.role, applicationData: application.data, createdAt: new Date() },
          })
        : await transaction.teamJoinRequest.create({
            data: { teamId, userId: req.user!.id, status: 'PENDING', roleAppliedFor: application.role, applicationData: application.data },
          });

      await transaction.notification.create({
        data: {
          recipientId: team.creatorId,
          type: 'TEAM_JOIN_REQUEST',
          title: 'New team request',
          message: `${String(req.user!.dbUser?.name || 'A student')} applied for ${application.role} on ${team.title}.`,
          relatedEntityType: 'TEAM',
          relatedEntityId: team.id,
        },
      });
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 20000 });

    res.status(201).json({ request: result });
  } catch (error) {
    const conflict = error instanceof Error && ['OWN_TEAM', 'ALREADY_MEMBER', 'TEAM_FULL', 'DUPLICATE_REQUEST', 'EXPIRED'].includes(error.message);
    if (error instanceof Error && error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Team post not found' });
    if (isPrismaError(error, 'P2002') || isPrismaError(error, 'P2034')) return res.status(409).json({ error: 'Team changed or request already exists; please refresh' });
    if (error instanceof Error && error.message === 'EXPIRED') return res.status(409).json({ error: 'This recruitment post has expired' });
    if (conflict) return res.status(409).json({ error: error.message.replace(/_/g, ' ').toLowerCase() });
    console.error('Failed to create team request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/requests/:requestId/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    const requestId = getParam(req.params.requestId);
    if (!teamId || !requestId) return res.status(400).json({ error: 'Missing team or request id' });
    const result = await prisma.teamJoinRequest.updateMany({
      where: { id: requestId, teamId, userId: req.user!.id, status: { in: ['PENDING', 'SHORTLISTED'] } },
      data: { status: 'WITHDRAWN' },
    });
    if (!result.count) return res.status(404).json({ error: 'Pending request not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to withdraw team request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/requests/:requestId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    const requestId = getParam(req.params.requestId);
    const status = String(req.body?.status || '').toUpperCase();
    if (!teamId || !requestId || !['SHORTLISTED', 'ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'A valid SHORTLISTED, ACCEPTED, or REJECTED status is required' });
    }

    const request = await prisma.$transaction(async (transaction) => {
      const team = await transaction.teamPost.findUnique({ where: { id: teamId }, include: { memberships: true } });
      if (!team) throw new Error('NOT_FOUND');
      if (team.creatorId !== req.user!.id) throw new Error('FORBIDDEN');
      const joinRequest = await transaction.teamJoinRequest.findFirst({ where: { id: requestId, teamId } });
      if (!joinRequest) throw new Error('REQUEST_NOT_FOUND');
      if (!['PENDING', 'SHORTLISTED'].includes(joinRequest.status)) throw new Error('INVALID_STATE');

      if (status === 'ACCEPTED') {
        if (effectiveDeadline(team).getTime() <= Date.now()) throw new Error('EXPIRED');
        if (team.memberships.some((member) => member.userId === joinRequest.userId)) throw new Error('ALREADY_MEMBER');
        if (team.teamSize != null && team.memberships.length >= team.teamSize) throw new Error('TEAM_FULL');
        const role = getTeamRoles(team.roles).find((item) => item.title === joinRequest.roleAppliedFor);
        if (!role) throw new Error('ROLE_UNAVAILABLE');
        await transaction.teamPost.update({ where: { id: teamId }, data: { updatedAt: new Date() } });
        const acceptedForRole = await transaction.teamMembership.count({ where: { teamId, position: role.title } });
        if (acceptedForRole >= role.openings) throw new Error('ROLE_FULL');
        await transaction.teamMembership.create({ data: { teamId, userId: joinRequest.userId, role: 'MEMBER', position: role.title } });

        const contextKey = `TEAM:${team.id}`;
        const conversation = await transaction.conversation.upsert({
          where: { contextKey },
          update: {},
          create: { contextType: 'TEAM', contextId: team.id, contextKey },
        });
        const participantIds = [...new Set([...team.memberships.map((member) => member.userId), joinRequest.userId])];
        await transaction.conversationMember.createMany({
          data: participantIds.map((userId) => ({ conversationId: conversation.id, userId })),
          skipDuplicates: true,
        });
      }

      const updated = await transaction.teamJoinRequest.update({ where: { id: requestId }, data: { status } });
      if (status === 'SHORTLISTED' || status === 'ACCEPTED' || status === 'REJECTED') await transaction.notification.create({
        data: {
          recipientId: joinRequest.userId,
          type: status === 'ACCEPTED' ? 'TEAM_REQUEST_ACCEPTED' : status === 'REJECTED' ? 'TEAM_REQUEST_REJECTED' : 'TEAM_REQUEST_SHORTLISTED',
          title: status === 'ACCEPTED' ? 'Team application accepted' : status === 'REJECTED' ? 'Team application declined' : 'Application shortlisted',
          message: status === 'ACCEPTED'
            ? `You were selected for ${joinRequest.roleAppliedFor || 'a role'} on ${team.title}.`
            : status === 'REJECTED'
              ? `Your application for ${joinRequest.roleAppliedFor || 'a role'} on ${team.title} was not selected.`
              : `Your application for ${joinRequest.roleAppliedFor || 'a role'} on ${team.title} has been shortlisted.`,
          relatedEntityType: 'TEAM',
          relatedEntityId: team.id,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });

    res.json({ request });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Team post not found' });
    if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') return res.status(404).json({ error: 'Join request not found' });
    if (error instanceof Error && error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Only the team creator can manage requests' });
    if (error instanceof Error && error.message === 'EXPIRED') return res.status(409).json({ error: 'This recruitment post has expired; candidates cannot be selected' });
    if (error instanceof Error && ['ROLE_FULL', 'ROLE_UNAVAILABLE'].includes(error.message)) return res.status(409).json({ error: error.message === 'ROLE_FULL' ? 'All openings for this role have been filled' : 'The selected role is no longer available' });
    if (isPrismaError(error, 'P2002') || isPrismaError(error, 'P2034')) return res.status(409).json({ error: 'Team capacity or membership changed; please refresh' });
    if (error instanceof Error && ['INVALID_STATE', 'ALREADY_MEMBER', 'TEAM_FULL'].includes(error.message)) {
      return res.status(409).json({ error: error.message.replace(/_/g, ' ').toLowerCase() });
    }
    console.error('Failed to update team request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/requests/:requestId/notes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    const requestId = getParam(req.params.requestId);
    const notes = String(req.body?.notes || '').trim();
    if (!teamId || !requestId) return res.status(400).json({ error: 'Missing team or request id' });
    if (notes.length > 3000) return res.status(400).json({ error: 'Recruiter notes must be 3,000 characters or fewer' });
    const team = await prisma.teamPost.findUnique({ where: { id: teamId }, select: { creatorId: true } });
    if (!team) return res.status(404).json({ error: 'Team post not found' });
    if (team.creatorId !== req.user!.id) return res.status(403).json({ error: 'Only the team creator can manage private notes' });
    const result = await prisma.teamJoinRequest.updateMany({
      where: { id: requestId, teamId },
      data: { recruiterNotes: notes || null },
    });
    if (!result.count) return res.status(404).json({ error: 'Join request not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save recruiter notes:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/members/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = getParam(req.params.id);
    const memberId = getParam(req.params.userId);
    if (!teamId || !memberId) return res.status(400).json({ error: 'Missing team or member id' });
    const team = await prisma.teamPost.findUnique({ where: { id: teamId }, select: { creatorId: true } });
    if (!team) return res.status(404).json({ error: 'Team post not found' });
    if (team.creatorId !== req.user!.id) return res.status(403).json({ error: 'Only the team creator can manage members' });
    if (memberId === team.creatorId) return res.status(400).json({ error: 'The team creator cannot be removed' });

    const removed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.teamMembership.deleteMany({ where: { teamId, userId: memberId } });
      if (!result.count) return false;
      await transaction.conversationMember.deleteMany({
        where: { userId: memberId, conversation: { contextKey: `TEAM:${teamId}` } },
      });
      await transaction.notification.create({
        data: {
          recipientId: memberId,
          type: 'TEAM_MEMBERSHIP_REMOVED',
          title: 'Team membership updated',
          message: 'The team creator removed your membership.',
          relatedEntityType: 'TEAM',
          relatedEntityId: teamId,
        },
      });
      return true;
    });
    if (!removed) return res.status(404).json({ error: 'Team member not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove team member:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;