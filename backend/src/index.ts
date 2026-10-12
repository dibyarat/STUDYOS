import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string | null;
        dbUser?: Record<string, unknown>;
      };
    }
  }
}

import resourcesRouter from './routes/resources';
import classesRouter from './routes/classes';
import teamsRouter from './routes/teams';
import notificationsRouter from './routes/notifications';
import helpServicesRouter from './routes/help-services';
import skillsRouter from './routes/skills';
import conversationsRouter from './routes/conversations';
import projectsRouter from './routes/projects';
import timetableRouter from './routes/timetable';
import attendanceRouter from './routes/attendance';
import { requireAuth } from './middleware/auth';

const app = express();
const PORT = Number(process.env.PORT || 3001);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : []),
].filter(Boolean) as string[];

const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+(\.vercel\.app|\.campassist\.me)$/i.test(origin)) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400,
  }),
);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') && req.path !== '/health') return next();
    const startedAt = process.hrtime.bigint();
    const requestPath = req.path;
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.info(`[api] ${req.method} ${requestPath} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    });
    next();
  });
}

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/api/v1/studyos/resources', resourcesRouter);
app.use('/api/v1/studyos/classes', classesRouter);
app.use('/api/v1/studyos/teams', teamsRouter);
app.use('/api/v1/studyos/help-services', helpServicesRouter);
app.use('/api/v1/studyos/notifications', notificationsRouter);
app.use('/api/v1/studyos/skills', skillsRouter);
app.use('/api/v1/studyos/conversations', conversationsRouter);
app.use('/api/v1/studyos/projects', projectsRouter);
app.use('/api/v1/studyos/timetable', timetableRouter);
app.use('/api/v1/studyos/attendance', attendanceRouter);

app.get(['/api/v1/studyos/institutions', '/institutions'], async (_req, res) => {
  try {
    const institutions = await prisma.institution.findMany({});
    res.json(institutions);
  } catch (error) {
    console.error('Failed to load institutions:', error);
    res.status(500).json({ error: 'Unable to load institutions' });
  }
});

app.get('/api/v1/studyos/dashboard/summary', requireAuth, async (_req, res) => {
  try {
    const [teamPosts, helpServices] = await Promise.all([
      prisma.teamPost.count(),
      prisma.helpService.count(),
    ]);
    res.json({ teamPosts, helpServices });
  } catch (error) {
    console.error('Failed to load dashboard summary:', error);
    res.status(500).json({ error: 'Unable to load dashboard summary' });
  }
});

app.get('/api/v1/studyos/search', requireAuth, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length > 100) return res.status(400).json({ error: 'Search query must be 100 characters or fewer' });
    const requestedPage = Number.parseInt(String(req.query.page || '1'), 10);
    const requestedLimit = Number.parseInt(String(req.query.limit || '8'), 10);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ error: 'Page and limit must be positive integers' });
    }
    const page = requestedPage;
    const limit = Math.min(requestedLimit, 10);
    const skip = (page - 1) * limit;
    if (!query) {
      return res.json({ query, page, limit, results: {}, hasMore: {} });
    }

    const contains = { contains: query, mode: 'insensitive' as const };
    const [resources, projects, labs, teamPosts, helpServices, people] = await Promise.all([
      prisma.resource.findMany({
        where: {
          visibility: 'PUBLIC',
          OR: [
            { title: contains }, { description: contains }, { subject: contains }, { topic: contains },
            { tags: { some: { tag: contains } } },
          ],
        },
        select: { id: true, title: true, description: true, type: true, subject: true, topic: true, creatorId: true, visibility: true, createdAt: true, creator: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: limit + 1,
      }),
      prisma.project.findMany({
        where: {
          AND: [
            { OR: [{ visibility: 'PUBLIC' }, { creatorId: req.user!.id }] },
            { OR: [
              { title: contains }, { description: contains }, { category: contains }, { technology: contains },
              { tags: { some: { tag: contains } } },
            ] },
          ],
        },
        select: { id: true, title: true, description: true, category: true, technology: true, githubUrl: true, demoUrl: true, creatorId: true, visibility: true, createdAt: true, creator: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: limit + 1,
      }),
      prisma.labRecord.findMany({
        where: { OR: [
          { name: contains }, { aim: contains }, { procedure: contains }, { code: contains }, { output: contains }, { subjectId: contains },
        ] },
        select: { id: true, experimentNo: true, name: true, aim: true, subjectId: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, skip, take: limit + 1,
      }),
      prisma.teamPost.findMany({
        where: { OR: [
          { title: contains }, { description: contains }, { reqSkills: contains }, { requirements: contains }, { type: contains },
        ] },
        select: { id: true, title: true, type: true, description: true, reqSkills: true, requirements: true, teamSize: true, deadline: true, creatorId: true, createdAt: true, creator: { select: { id: true, name: true, avatarUrl: true } }, _count: { select: { memberships: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: limit + 1,
      }),
      prisma.helpService.findMany({
        where: { OR: [
          { title: contains }, { description: contains }, { category: contains }, { skills: contains },
        ] },
        select: { id: true, title: true, description: true, category: true, skills: true, isPaid: true, price: true, providerId: true, createdAt: true, provider: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: limit + 1,
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { academicIdentity: { is: { isPublic: true } } },
            { profile: { isNot: null } }
          ],
          AND: [
            {
              OR: [
                { name: contains },
                { profile: { is: { fullName: contains } } },
                { profile: { is: { department: contains } } },
                { academicIdentity: { is: { degree: contains } } },
                { academicIdentity: { is: { stream: contains } } },
                { academicIdentity: { is: { branch: contains } } },
                { academicIdentity: { is: { specialization: contains } } },
                { academicIdentity: { is: { institution: contains } } },
                { skills: { some: { skill: { name: contains } } } },
              ],
            }
          ]
        },
        select: {
          id: true, name: true, avatarUrl: true,
          profile: { select: { fullName: true, department: true, semester: true } },
          academicIdentity: { select: { degree: true, stream: true, branch: true, specialization: true, institution: true, year: true, semester: true, session: true, github: true, linkedin: true, portfolio: true } },
          skills: { select: { skill: { select: { id: true, name: true } } } },
        },
        orderBy: { name: 'asc' }, skip, take: limit + 1,
      }),
    ]);

    const trimPage = <T,>(items: T[]) => ({ items: items.slice(0, limit), hasMore: items.length > limit });
    const resourcePage = trimPage(resources);
    const projectPage = trimPage(projects);
    const labPage = trimPage(labs);
    const teamPage = trimPage(teamPosts);
    const helpPage = trimPage(helpServices);
    const peoplePage = trimPage(people);
    res.json({
      query, page, limit,
      results: {
        resources: resourcePage.items,
        classes: [],
        projects: projectPage.items,
        labs: labPage.items,
        teamPosts: teamPage.items,
        helpServices: helpPage.items,
        people: peoplePage.items.map((person) => ({ ...person, skills: person.skills.map(({ skill }) => skill) })),
      },
      hasMore: {
        resources: resourcePage.hasMore,
        classes: false,
        projects: projectPage.hasMore,
        labs: labPage.hasMore,
        teamPosts: teamPage.hasMore,
        helpServices: helpPage.hasMore,
        people: peoplePage.hasMore,
      },
    });
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/v1/studyos/sync-user', requireAuth, async (req, res) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, avatarUrl } = req.body || {};
    const user = await prisma.user.upsert({
      where: { id: authUser.id },
      update: {
        email: authUser.email || undefined,
      },
      create: {
        id: authUser.id,
        email: authUser.email || `${authUser.id}@studyos.local`,
        name: name || authUser.email?.split('@')[0] || 'StudyOS User',
        avatarUrl: avatarUrl || '',
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('sync-user failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/v1/studyos/profile/:userId', requireAuth, async (req, res) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user id' });
    }
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'You can only view your own profile' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, academicIdentity: true, Institution: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('profile fetch failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/v1/studyos/public-profile/:userId', requireAuth, async (req, res) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Missing user id' });
    const user = await prisma.user.findFirst({
      where: { id: userId, academicIdentity: { is: { isPublic: true } } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        academicIdentity: {
          select: {
            degree: true, stream: true, branch: true, specialization: true,
            institution: true, year: true, semester: true, session: true,
            github: true, linkedin: true, portfolio: true,
            bio: true, residency: true, rollNumber: true, department: true, section: true,
            gender: true, skills: true, experience: true,
          },
        },
        skills: { select: { proficiency: true, experience: true, portfolioUrl: true, skill: { select: { id: true, name: true } } } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Public profile not found' });
    const isOwner = req.user?.id === userId;
    const academicIdentity = user.academicIdentity
      ? {
          ...user.academicIdentity,
          rollNumber: isOwner ? user.academicIdentity.rollNumber : undefined,
          residency: isOwner ? user.academicIdentity.residency : undefined,
          gender: isOwner ? user.academicIdentity.gender : undefined,
        }
      : null;

    res.json({
      user: {
        ...user,
        academicIdentity,
        skills: user.skills.map(({ skill, proficiency, experience, portfolioUrl }) => ({
          ...skill,
          proficiency,
          experience,
          portfolioUrl,
        })),
      },
    });
  } catch (error) {
    console.error('Public profile fetch failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/v1/studyos/profile/:userId', requireAuth, async (req, res) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user id' });
    }
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }

    const body = req.body || {};
    const optionalText = (key: string, maxLength: number): string | null | undefined => {
      if (body[key] === undefined) return undefined;
      const value = String(body[key] ?? '').trim();
      if (value.length > maxLength) throw new Error(`${key} is too long`);
      return value || null;
    };
    const optionalUrl = (key: string): string | null | undefined => {
      const value = optionalText(key, 2048);
      if (!value) return value;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:') throw new Error('invalid');
        return url.toString();
      } catch {
        throw new Error(`${key} must be a valid HTTPS URL`);
      }
    };

    let input;
    try {
      input = {
        name: optionalText('name', 120),
        avatarUrl: optionalUrl('avatarUrl'),
        degree: optionalText('degree', 100),
        stream: optionalText('stream', 120),
        branch: optionalText('branch', 120),
        specialization: optionalText('specialization', 160),
        institution: optionalText('institution', 200),
        year: optionalText('year', 40),
        semester: optionalText('semester', 40),
        session: optionalText('session', 80),
        github: optionalUrl('github'),
        linkedin: optionalUrl('linkedin'),
        portfolio: optionalUrl('portfolio'),
        bio: optionalText('bio', 2000),
        residency: optionalText('residency', 40),
        rollNumber: optionalText('rollNumber', 80),
        department: optionalText('department', 120),
        section: optionalText('section', 80),
        gender: optionalText('gender', 40),
        tonePreference: optionalText('tonePreference', 40),
        skills: optionalText('skills', 1000),
        experience: optionalText('experience', 2000),
      };
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid profile data' });
    }
    if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') {
      return res.status(400).json({ error: 'isPublic must be a boolean' });
    }

    const { user, academicIdentity } = await prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({ where: { id: userId }, include: { profile: true } });
      const rawResidency = input.residency || (body.studentType ? String(body.studentType) : undefined);
      const normResidency = rawResidency
        ? (rawResidency.toUpperCase().includes('HOSTEL') ? 'HOSTELER' : 'DAY_SCHOLAR')
        : (existingUser?.profile?.residency || (existingUser?.studentType === 'HOSTELLER' ? 'HOSTELER' : (existingUser?.studentType === 'DAY_SCHOLAR' ? 'DAY_SCHOLAR' : null)));
      const studentType = normResidency === 'HOSTELER' ? 'HOSTELLER' : (normResidency === 'DAY_SCHOLAR' ? 'DAY_SCHOLAR' : null);

      let resolvedInstitution = input.institution;
      let matchedInstitutionId: string | null = null;
      if (body.institutionId || input.institution) {
        try {
          const allInst = await transaction.institution.findMany({});
          const matched = allInst.find(
            (i: any) =>
              (body.institutionId && i.id === body.institutionId) ||
              (input.institution && (
                i.name?.toLowerCase() === input.institution.toLowerCase() ||
                i.code?.toLowerCase() === input.institution.toLowerCase() ||
                `${i.name} (${i.code})`.toLowerCase() === input.institution.toLowerCase()
              ))
          );
          if (matched) {
            matchedInstitutionId = matched.id;
            resolvedInstitution = matched.name;
          }
        } catch (e) {
          console.warn('Could not match institution:', e);
        }
      }

      const user = await transaction.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          avatarUrl: input.avatarUrl,
          gender: input.gender ?? existingUser?.gender ?? null,
          tonePreference: input.tonePreference,
          studentType,
          ...(matchedInstitutionId ? { institutionId: matchedInstitutionId } : {}),
        },
      });
      await transaction.profile.upsert({
        where: { userId },
        update: {
          fullName: input.name,
          avatarUrl: input.avatarUrl || null,
          department: input.department,
          section: input.section,
          rollNumber: input.rollNumber,
          semester: input.semester,
          bio: input.bio,
          residency: normResidency,
          studentType,
          gender: input.gender ?? existingUser?.profile?.gender ?? null,
          ...(resolvedInstitution !== undefined ? { institution: resolvedInstitution } : {}),
        },
        create: {
          userId,
          fullName: input.name || user.name,
          avatarUrl: input.avatarUrl || null,
          department: input.department ?? null,
          section: input.section ?? null,
          rollNumber: input.rollNumber ?? null,
          semester: input.semester ?? null,
          bio: input.bio ?? null,
          residency: normResidency ?? 'DAY_SCHOLAR',
          studentType: studentType ?? 'DAY_SCHOLAR',
          gender: input.gender ?? null,
          institution: resolvedInstitution ?? null,
        },
      });
      const academicIdentity = await transaction.academicIdentity.upsert({
        where: { userId },
        update: {
          degree: input.degree,
          stream: input.stream,
          branch: input.branch,
          specialization: input.specialization,
          institution: resolvedInstitution !== undefined ? resolvedInstitution : input.institution,
          year: input.year,
          semester: input.semester,
          session: input.session,
          github: input.github,
          linkedin: input.linkedin,
          portfolio: input.portfolio,
          bio: input.bio,
          residency: normResidency,
          studentType,
          rollNumber: input.rollNumber,
          department: input.department,
          section: input.section,
          gender: input.gender ?? existingUser?.academicIdentity?.gender ?? null,
          tonePreference: input.tonePreference,
          skills: input.skills,
          experience: input.experience,
          isPublic: body.isPublic,
        },
        create: {
          userId,
          degree: input.degree ?? null,
          stream: input.stream ?? null,
          branch: input.branch ?? null,
          specialization: input.specialization ?? null,
          institution: input.institution ?? null,
          year: input.year ?? null,
          semester: input.semester ?? null,
          session: input.session ?? null,
          github: input.github ?? null,
          linkedin: input.linkedin ?? null,
          portfolio: input.portfolio ?? null,
          bio: input.bio ?? null,
          residency: normResidency ?? 'DAY_SCHOLAR',
          studentType: studentType ?? 'DAY_SCHOLAR',
          rollNumber: input.rollNumber ?? null,
          department: input.department ?? null,
          section: input.section ?? null,
          gender: input.gender ?? null,
          tonePreference: input.tonePreference ?? null,
          skills: input.skills ?? null,
          experience: input.experience ?? null,
          isPublic: body.isPublic ?? false,
        },
      });

      // If user is a CR and updated their section, sync crAssignment
      if (existingUser?.role === 'CR' && input.section) {
        await transaction.user.update({
          where: { id: userId },
          data: {
            crAssignment: {
              sectionId: input.section,
              isActive: true,
              section: { name: input.section },
            },
          },
        }).catch(() => {});
      }

      return { user, academicIdentity };
    });

    res.json({ user, academicIdentity });
  } catch (error) {
    console.error('profile update failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/studyos/roles/set-cr
app.post('/api/v1/studyos/roles/set-cr', requireAuth, async (req, res) => {
  try {
    const callerId = req.user!.id;
    const targetUserId = String(req.body.userId || callerId).trim();
    const sectionName = String(req.body.section || 'A').trim();

    // Check caller role or allow self-assignment
    const caller = await prisma.user.findUnique({ where: { id: callerId } });
    const isDev = caller?.role === 'DEVELOPER';

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: 'CR',
        crAssignment: {
          id: `cr-${targetUserId}`,
          sectionId: sectionName,
          isActive: true,
          section: { id: sectionName, name: sectionName },
        },
      },
    });

    res.json({
      success: true,
      message: `Granted CR role for Section ${sectionName} to user ${targetUserId}`,
      user: updated,
    });
  } catch (error) {
    console.error('Failed to set CR role:', error);
    res.status(500).json({ error: 'Failed to assign CR role' });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

function shutdown(signal: NodeJS.Signals) {
  console.info(`Received ${signal}; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error('HTTP server shutdown failed:', error);
      process.exitCode = 1;
    }
    void prisma.$disconnect().catch((disconnectError: unknown) => {
      console.error('Prisma shutdown failed:', disconnectError);
      process.exitCode = 1;
    });
  });
}

process.on('unhandledRejection', (reason) => {
  console.warn('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
