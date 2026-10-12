import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Helper to compute messages
function generateAttendanceMessage(
  percentage: number,
  target: number,
  safeSkips: number,
  classesNeeded: number,
  tone: string,
  held: number,
): string {
  if (held === 0) {
    if (tone === 'bro') return "New semester bro! Mark your first class to track your attendance streak.";
    if (tone === 'baddie') return "Fresh start baddie! Mark your classes to keep your streak flawless.";
    if (tone === 'buddy') return "Welcome buddy! Mark your classes as they happen to stay ahead.";
    return "No classes recorded yet. Mark attendance to start tracking.";
  }

  if (percentage >= target) {
    if (safeSkips === 0) {
      if (tone === 'bro') return `You're right on the edge bro (${percentage.toFixed(1)}%). Don't miss your next class!`;
      if (tone === 'baddie') return `On the borderline baddie (${percentage.toFixed(1)}%). Protect your attendance streak!`;
      if (tone === 'buddy') return `Right at target buddy (${percentage.toFixed(1)}%). Keep attending to build a safety net!`;
      return `Attendance is right at target (${percentage.toFixed(1)}%). Attend your upcoming classes.`;
    }

    const sWord = safeSkips === 1 ? 'class' : 'classes';
    if (tone === 'bro') return `You're golden bro! You can safely skip ${safeSkips} ${sWord} without falling below ${target}%.`;
    if (tone === 'baddie') return `Slaying baddie! You have ${safeSkips} safe ${sWord} in the bag. Keep shining!`;
    if (tone === 'buddy') return `Awesome job buddy! You can safely skip ${safeSkips} ${sWord} while staying above ${target}%.`;
    return `Attendance is on track. You can safely miss ${safeSkips} ${sWord} and stay above ${target}%.`;
  } else {
    const cWord = classesNeeded === 1 ? 'class' : 'classes';
    if (tone === 'bro') return `Time to lock in bro! Attend ${classesNeeded} more ${cWord} in a row to reach ${target}%.`;
    if (tone === 'baddie') return `Hustle time baddie! Attend ${classesNeeded} more ${cWord} to get back on top!`;
    if (tone === 'buddy') return `Keep pushing buddy! Attend ${classesNeeded} more ${cWord} to reach your ${target}% target.`;
    return `You need to attend ${classesNeeded} consecutive ${cWord} to reach ${target}% attendance.`;
  }
}

// GET /api/v1/studyos/attendance
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Load user profile & preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, academicIdentity: true },
    });

    const userSection =
      user?.crAssignment?.section?.name ||
      user?.crAssignment?.sectionId ||
      user?.academicIdentity?.section ||
      user?.profile?.section ||
      '';

    const tonePreference =
      (user as any)?.tonePreference ||
      user?.academicIdentity?.tonePreference ||
      ((user?.academicIdentity?.gender === 'Boy' || user?.profile?.gender === 'Boy') ? 'bro' :
       (user?.academicIdentity?.gender === 'Girl' || user?.profile?.gender === 'Girl') ? 'baddie' : 'buddy');

    // 1. Fetch attendance register (CampAssist / APK compatibility)
    let register = await prisma.attendanceRegister.findUnique({
      where: { id: userId },
    });

    if (!register) {
      register = {
        id: userId,
        target: 75,
        subjects: [],
        logs: [],
      };
    }

    const target = typeof register.target === 'number' ? register.target : 75;
    const subjectsMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      type: string;
      attended: number;
      absent: number;
      cancelled: number;
    }>();

    // Populate from register subjects
    for (const s of (register.subjects || [])) {
      const key = (s.name || s.id).toLowerCase();
      let pCount = 0;
      let aCount = 0;
      let cCount = 0;

      for (const comp of (s.components || [])) {
        pCount += comp.base?.p || 0;
        aCount += comp.base?.a || 0;
      }

      for (const log of (register.logs || [])) {
        if (log.sid === s.id) {
          if (log.status === 'p') pCount++;
          else if (log.status === 'a') aCount++;
          else if (log.status === 'c') cCount++;
        }
      }

      subjectsMap.set(key, {
        id: s.id,
        name: s.name,
        code: s.code || s.name.slice(0, 4).toUpperCase(),
        type: s.type || 'Theory',
        attended: pCount,
        absent: aCount,
        cancelled: cCount,
      });
    }

    // 2. Cross-reference with timetable for user's section to include all active classes!
    if (userSection) {
      const allTimetable = await prisma.timetable.findMany({});
      const matched = allTimetable.filter((item: any) => {
        if (!item || item.status === 'CANCELLED') return false;
        const s = String(item.sectionId || item.sectionName || item.section || '').trim().toLowerCase();
        const targetSec = userSection.toLowerCase();
        return (
          s === targetSec ||
          s === `section ${targetSec}` ||
          `section ${s}` === targetSec ||
          s.replace(/section\s*/i, '') === targetSec.replace(/section\s*/i, '')
        );
      });

      for (const t of matched) {
        const name = String(t.subjectName || 'Class').trim();
        const key = name.toLowerCase();
        if (!subjectsMap.has(key)) {
          subjectsMap.set(key, {
            id: t.subjectId || randomUUID(),
            name,
            code: String(t.subjectCode || name.slice(0, 4).toUpperCase()).trim(),
            type: String(t.type || 'Lecture').trim(),
            attended: 0,
            absent: 0,
            cancelled: 0,
          });
        }
      }
    }

    // 3. Fallback: also check attendance_records collection if any exist
    try {
      const individualRecords = await prisma.attendanceRecord.findMany({
        where: { studentId: userId },
      });
      for (const rec of individualRecords) {
        const subRef = String(rec.subjectRef || 'Class').trim();
        const key = subRef.toLowerCase();
        if (!subjectsMap.has(key)) {
          subjectsMap.set(key, {
            id: randomUUID(),
            name: subRef,
            code: subRef.slice(0, 4).toUpperCase(),
            type: 'Theory',
            attended: 0,
            absent: 0,
            cancelled: 0,
          });
        }
        // If register didn't track this log
        const sub = subjectsMap.get(key)!;
        if (!register.logs?.some((l: any) => l.id === rec.id)) {
          if (rec.state === 'PRESENT') sub.attended++;
          else if (rec.state === 'ABSENT') sub.absent++;
          else if (rec.state === 'CANCELLED' || rec.state === 'HOLIDAY') sub.cancelled++;
        }
      }
    } catch {}

    // Calculate subject stats
    let totalAttended = 0;
    let totalAbsent = 0;
    let totalCancelled = 0;

    const subjectsList = Array.from(subjectsMap.values()).map((sub) => {
      const held = sub.attended + sub.absent;
      const pct = held > 0 ? (sub.attended / held) * 100 : 0;
      const targetFrac = target / 100;

      let safeSkips = 0;
      let classesNeeded = 0;

      if (pct >= target) {
        safeSkips = Math.max(0, Math.floor(sub.attended - targetFrac * held));
      } else {
        classesNeeded = Math.ceil((targetFrac * held - sub.attended) / (1 - targetFrac));
      }

      totalAttended += sub.attended;
      totalAbsent += sub.absent;
      totalCancelled += sub.cancelled;

      return {
        id: sub.id,
        name: sub.name,
        code: sub.code,
        type: sub.type,
        attended: sub.attended,
        absent: sub.absent,
        cancelled: sub.cancelled,
        held,
        percentage: Number(pct.toFixed(1)),
        safeSkips,
        classesNeeded,
      };
    });

    const totalHeld = totalAttended + totalAbsent;
    const overallPercentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;
    const targetFraction = target / 100;

    let overallSafeSkips = 0;
    let overallClassesNeeded = 0;

    if (overallPercentage >= target) {
      overallSafeSkips = Math.max(0, Math.floor(totalAttended - targetFraction * totalHeld));
    } else {
      overallClassesNeeded = Math.ceil((targetFraction * totalHeld - totalAttended) / (1 - targetFraction));
    }

    const message = generateAttendanceMessage(
      overallPercentage,
      target,
      overallSafeSkips,
      overallClassesNeeded,
      tonePreference,
      totalHeld,
    );

    res.json({
      success: true,
      target,
      tonePreference,
      overall: {
        attended: totalAttended,
        absent: totalAbsent,
        cancelled: totalCancelled,
        held: totalHeld,
        percentage: Number(overallPercentage.toFixed(1)),
        safeSkips: overallSafeSkips,
        classesNeeded: overallClassesNeeded,
        status: overallPercentage >= target ? 'SAFE' : overallPercentage >= target - 10 ? 'WARNING' : 'CRITICAL',
      },
      message,
      subjects: subjectsList,
      logs: (register.logs || []).slice(-30).reverse(),
    });
  } catch (error) {
    console.error('Failed to get attendance:', error);
    res.status(500).json({ error: 'Failed to load attendance details' });
  }
});

// POST /api/v1/studyos/attendance/mark
router.post('/mark', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { subjectName, subjectCode, status, date } = req.body || {};

    if (!subjectName || !status) {
      return res.status(400).json({ error: 'Subject name and status (PRESENT, ABSENT, CANCELLED) are required' });
    }

    const normalizedStatus =
      status === 'PRESENT' || status === 'p' ? 'p' :
      status === 'ABSENT' || status === 'a' ? 'a' : 'c';

    // 1. Fetch or initialize register
    let register = await prisma.attendanceRegister.findUnique({
      where: { id: userId },
    });

    if (!register) {
      register = {
        id: userId,
        target: 75,
        subjects: [],
        logs: [],
      };
    }

    const subjects = Array.isArray(register.subjects) ? [...register.subjects] : [];
    const logs = Array.isArray(register.logs) ? [...register.logs] : [];

    let targetSub = subjects.find(
      (s: any) => s.name?.toLowerCase() === subjectName.toLowerCase() || s.id === subjectName,
    );

    if (!targetSub) {
      targetSub = {
        id: randomUUID(),
        name: subjectName,
        code: subjectCode || subjectName.slice(0, 4).toUpperCase(),
        components: [{ key: 'Regular', base: { p: 0, a: 0 } }],
        createdAt: new Date().toISOString(),
      };
      subjects.push(targetSub);
    }

    const logId = randomUUID();
    const markDate = date || new Date().toISOString().slice(0, 10);
    const newLog = {
      id: logId,
      sid: targetSub.id,
      comp: 'Regular',
      status: normalizedStatus,
      date: markDate,
      at: new Date().toISOString(),
    };

    logs.push(newLog);

    await prisma.attendanceRegister.upsert({
      where: { id: userId },
      update: {
        subjects,
        logs,
        updatedAt: new Date().toISOString(),
      },
      create: {
        id: userId,
        target: register.target || 75,
        subjects,
        logs,
        updatedAt: new Date().toISOString(),
      },
    });

    // Also sync to attendance_records for redundancy
    try {
      await prisma.attendanceRecord.create({
        data: {
          id: logId,
          studentId: userId,
          subjectRef: targetSub.name,
          date: new Date(markDate).toISOString(),
          state: normalizedStatus === 'p' ? 'PRESENT' : normalizedStatus === 'a' ? 'ABSENT' : 'CANCELLED',
          updatedAt: new Date().toISOString(),
        },
      });
    } catch {}

    res.json({
      success: true,
      message: `Marked ${normalizedStatus === 'p' ? 'Present' : normalizedStatus === 'a' ? 'Absent' : 'Cancelled'} for ${targetSub.name}`,
      log: newLog,
    });
  } catch (error) {
    console.error('Failed to mark attendance:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

// POST /api/v1/studyos/attendance/target
router.post('/target', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const targetVal = Number(req.body.target);

    if (isNaN(targetVal) || targetVal < 1 || targetVal > 100) {
      return res.status(400).json({ error: 'Target must be a number between 1 and 100' });
    }

    const register = await prisma.attendanceRegister.findUnique({
      where: { id: userId },
    });

    await prisma.attendanceRegister.upsert({
      where: { id: userId },
      update: { target: targetVal },
      create: {
        id: userId,
        target: targetVal,
        subjects: [],
        logs: [],
      },
    });

    res.json({ success: true, target: targetVal });
  } catch (error) {
    console.error('Failed to update target:', error);
    res.status(500).json({ error: 'Failed to update attendance target' });
  }
});

// POST /api/v1/studyos/attendance/undo
router.post('/undo', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const logId = req.body?.logId;

    const register = await prisma.attendanceRegister.findUnique({
      where: { id: userId },
    });

    if (!register || !Array.isArray(register.logs) || register.logs.length === 0) {
      return res.status(400).json({ error: 'No attendance logs to undo' });
    }

    let logs = [...register.logs];
    let removedLog: any = null;

    if (logId) {
      const idx = logs.findIndex((l: any) => l.id === logId);
      if (idx !== -1) {
        removedLog = logs[idx];
        logs.splice(idx, 1);
      }
    } else {
      removedLog = logs.pop();
    }

    await prisma.attendanceRegister.update({
      where: { id: userId },
      data: { logs, updatedAt: new Date().toISOString() },
    });

    if (removedLog) {
      await prisma.attendanceRecord.delete({ where: { id: removedLog.id } }).catch(() => {});
    }

    res.json({ success: true, message: 'Attendance entry removed successfully' });
  } catch (error) {
    console.error('Failed to undo attendance log:', error);
    res.status(500).json({ error: 'Failed to undo attendance' });
  }
});

export default router;
