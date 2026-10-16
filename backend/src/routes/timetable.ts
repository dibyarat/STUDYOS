import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { sensitiveLimiter } from '../middleware/rate-limit';

const router = Router();

// Helper to determine if user has CR / Developer role
async function getUserRoles(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, academicIdentity: true },
  });

  const role = (user?.role || 'STUDENT') as string;
  const isDeveloper = role === 'DEVELOPER';
  const isCR = role === 'CR' || isDeveloper;
  
  // Resolve user's section
  const section =
    user?.crAssignment?.section?.name ||
    user?.crAssignment?.sectionId ||
    user?.academicIdentity?.section ||
    user?.profile?.section ||
    '';

  return { user, role, isDeveloper, isCR, section };
}

// GET /api/v1/studyos/timetable
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { user, role, isDeveloper, isCR, section: userSection } = await getUserRoles(userId);

    const querySection = String(req.query.section || '').trim();
    const effectiveSection = querySection || userSection || 'A';

    // Fetch timetable entries for effective section
    const allEntries = await prisma.timetable.findMany({});
    
    // Flexible filter for section matching
    const matchedEntries = allEntries.filter((item: any) => {
      if (!item) return false;
      const s = String(item.sectionId || item.sectionName || item.section || '').trim().toLowerCase();
      const target = effectiveSection.toLowerCase();
      return (
        s === target ||
        s === `section ${target}` ||
        `section ${s}` === target ||
        s.replace(/section\s*/i, '') === target.replace(/section\s*/i, '')
      );
    });

    // Sort by dayOfWeek (1=Mon ... 7=Sun) then startTime
    matchedEntries.sort((a: any, b: any) => {
      const dayDiff = (Number(a.dayOfWeek) || 1) - (Number(b.dayOfWeek) || 1);
      if (dayDiff !== 0) return dayDiff;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });

    // Fetch holidays
    let holidays: any[] = [];
    try {
      holidays = await prisma.holiday.findMany({
        orderBy: { date: 'asc' },
      });
    } catch {
      holidays = [];
    }

    res.json({
      success: true,
      section: effectiveSection,
      userSection,
      role,
      isCR,
      isDeveloper,
      timetable: matchedEntries,
      holidays,
    });
  } catch (error) {
    console.error('Failed to get timetable:', error);
    res.status(500).json({ error: 'Failed to retrieve timetable' });
  }
});

// GET /api/v1/studyos/timetable/sections
router.get('/sections', requireAuth, async (_req, res) => {
  try {
    const [sectionsList, timetableEntries] = await Promise.all([
      prisma.section.findMany({}),
      prisma.timetable.findMany({}),
    ]);

    const set = new Set<string>();
    for (const s of sectionsList) {
      if (s.name) set.add(s.name);
    }
    for (const t of timetableEntries) {
      const s = t.sectionName || t.sectionId || t.section;
      if (s && typeof s === 'string') set.add(s);
    }

    // Default suggestions if set is small
    ['A', 'B', 'C', 'CSE-1', 'CSE-2', 'IT-1', 'ECE-1'].forEach((sec) => set.add(sec));

    const sections = Array.from(set).sort();
    res.json({ success: true, sections });
  } catch (error) {
    console.error('Failed to get sections:', error);
    res.status(500).json({ error: 'Failed to load sections' });
  }
});

// POST /api/v1/studyos/timetable/import
router.post('/import', sensitiveLimiter, requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { role, isDeveloper, isCR, section: userSection } = await getUserRoles(userId);

    const body = req.body || {};
    const targetSection = String(body.section || userSection || 'A').trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const replaceExisting = Boolean(body.replaceExisting);

    if (!entries.length) {
      return res.status(400).json({ error: 'No timetable entries provided to import' });
    }

    // Permission check: CR scoped to their section, Developer can import for any
    if (!isDeveloper && isCR) {
      const normUserSec = userSection.toLowerCase().replace(/section\s*/i, '');
      const normTarget = targetSection.toLowerCase().replace(/section\s*/i, '');
      if (normUserSec && normUserSec !== normTarget) {
        return res.status(403).json({
          error: `As Class Representative for Section ${userSection}, you can only publish timetables for your assigned section.`,
        });
      }
    } else if (!isDeveloper && !isCR) {
      return res.status(403).json({
        error: 'Only Class Representatives (CR) and Developers have permission to import section timetables.',
      });
    }

    // If replaceExisting, remove current entries for this section
    if (replaceExisting) {
      const current = await prisma.timetable.findMany({});
      for (const item of current) {
        const s = String(item.sectionId || item.sectionName || item.section || '').trim().toLowerCase();
        const target = targetSection.toLowerCase();
        if (
          s === target ||
          s === `section ${target}` ||
          `section ${s}` === target ||
          s.replace(/section\s*/i, '') === target.replace(/section\s*/i, '')
        ) {
          await prisma.timetable.delete({ where: { id: item.id } }).catch(() => {});
        }
      }
    }

    const createdEntries: any[] = [];
    const now = new Date().toISOString();

    for (const entry of entries) {
      const id = entry.id || randomUUID();
      const subjectName = String(entry.subjectName || entry.subject || 'Class').trim();
      const subjectCode = String(entry.subjectCode || entry.code || subjectName.slice(0, 4).toUpperCase()).trim();
      const dayOfWeek = Number(entry.dayOfWeek) || 1;
      const startTime = String(entry.startTime || '09:00').trim();
      const endTime = String(entry.endTime || '10:00').trim();
      const roomNumber = String(entry.roomNumber || entry.room || '').trim();
      const faculty = String(entry.faculty || entry.teacher || '').trim();
      const type = String(entry.type || 'Lecture').trim();

      const newRecord = {
        id,
        subjectId: subjectCode,
        subjectName,
        subjectCode,
        sectionId: targetSection,
        sectionName: targetSection,
        termId: entry.termId || 'TERM-1',
        dayOfWeek,
        startTime,
        endTime,
        roomId: roomNumber || null,
        roomNumber,
        faculty,
        type,
        status: 'ACTIVE',
        importedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      await prisma.timetable.create({ data: newRecord });
      createdEntries.push(newRecord);

      // Register subject if not present
      try {
        await prisma.subject.create({
          data: {
            id: randomUUID(),
            name: subjectName,
            code: subjectCode,
            type,
          },
        }).catch(() => {});
      } catch {}
    }

    res.json({
      success: true,
      message: `Successfully imported ${createdEntries.length} timetable entries for Section ${targetSection}.`,
      count: createdEntries.length,
      section: targetSection,
      entries: createdEntries,
    });
  } catch (error) {
    console.error('Timetable import failed:', error);
    res.status(500).json({ error: 'Failed to import timetable' });
  }
});

// POST /api/v1/studyos/timetable/entry (Create single entry)
router.post('/entry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { isDeveloper, isCR, section: userSection } = await getUserRoles(userId);

    if (!isDeveloper && !isCR) {
      return res.status(403).json({ error: 'Only CRs or Developers can add class entries' });
    }

    const data = req.body || {};
    const targetSection = String(data.section || userSection || 'A').trim();
    const id = randomUUID();
    const now = new Date().toISOString();

    const record = {
      id,
      subjectId: data.subjectCode || String(data.subjectName || 'Class').slice(0, 4).toUpperCase(),
      subjectName: String(data.subjectName || 'Class').trim(),
      subjectCode: String(data.subjectCode || '').trim(),
      sectionId: targetSection,
      sectionName: targetSection,
      termId: data.termId || 'TERM-1',
      dayOfWeek: Number(data.dayOfWeek) || 1,
      startTime: String(data.startTime || '09:00').trim(),
      endTime: String(data.endTime || '10:00').trim(),
      roomNumber: String(data.roomNumber || '').trim(),
      faculty: String(data.faculty || '').trim(),
      type: String(data.type || 'Lecture').trim(),
      status: 'ACTIVE',
      importedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await prisma.timetable.create({ data: record });
    res.json({ success: true, entry: record });
  } catch (error) {
    console.error('Failed to create timetable entry:', error);
    res.status(500).json({ error: 'Failed to create timetable entry' });
  }
});

// PATCH /api/v1/studyos/timetable/:id
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { isDeveloper, isCR, section: userSection } = await getUserRoles(userId);
    const entryId = req.params.id;

    if (!isDeveloper && !isCR) {
      return res.status(403).json({ error: 'Permission denied: CR or Developer required' });
    }

    const entry = await prisma.timetable.findUnique({ where: { id: entryId } });
    if (!entry) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }

    if (!isDeveloper) {
      const entrySec = String(entry.sectionId || entry.sectionName || '').toLowerCase().replace(/section\s*/i, '');
      const userSec = userSection.toLowerCase().replace(/section\s*/i, '');
      if (entrySec && userSec && entrySec !== userSec) {
        return res.status(403).json({ error: 'CRs can only update classes for their assigned section' });
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (req.body.status) updates.status = req.body.status;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.roomNumber !== undefined) updates.roomNumber = req.body.roomNumber;
    if (req.body.startTime) updates.startTime = req.body.startTime;
    if (req.body.endTime) updates.endTime = req.body.endTime;
    if (req.body.subjectName) updates.subjectName = req.body.subjectName;

    const updated = await prisma.timetable.update({
      where: { id: entryId },
      data: updates,
    });

    res.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Failed to update timetable entry:', error);
    res.status(500).json({ error: 'Failed to update timetable entry' });
  }
});

// DELETE /api/v1/studyos/timetable/:id
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { isDeveloper, isCR, section: userSection } = await getUserRoles(userId);
    const entryId = req.params.id;

    if (!isDeveloper && !isCR) {
      return res.status(403).json({ error: 'Permission denied: CR or Developer required' });
    }

    const entry = await prisma.timetable.findUnique({ where: { id: entryId } });
    if (!entry) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }

    if (!isDeveloper) {
      const entrySec = String(entry.sectionId || entry.sectionName || '').toLowerCase().replace(/section\s*/i, '');
      const userSec = userSection.toLowerCase().replace(/section\s*/i, '');
      if (entrySec && userSec && entrySec !== userSec) {
        return res.status(403).json({ error: 'CRs can only delete classes for their assigned section' });
      }
    }

    await prisma.timetable.delete({ where: { id: entryId } });
    res.json({ success: true, message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Failed to delete timetable entry:', error);
    res.status(500).json({ error: 'Failed to delete timetable entry' });
  }
});

// GET & POST /api/v1/studyos/timetable/holidays
router.get('/holidays', requireAuth, async (_req, res) => {
  try {
    const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    res.json({ success: true, holidays });
  } catch (error) {
    console.error('Failed to get holidays:', error);
    res.status(500).json({ error: 'Failed to get holidays' });
  }
});

router.post('/holidays', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { isDeveloper, isCR } = await getUserRoles(userId);

    if (!isDeveloper && !isCR) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { title, date, description, type } = req.body || {};
    if (!title || !date) {
      return res.status(400).json({ error: 'Holiday title and date are required' });
    }

    const holiday = {
      id: randomUUID(),
      title: String(title).trim(),
      date: String(date).trim(),
      description: String(description || '').trim(),
      type: String(type || 'HOLIDAY').trim(),
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    await prisma.holiday.create({ data: holiday });
    res.json({ success: true, holiday });
  } catch (error) {
    console.error('Failed to create holiday:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

export default router;

