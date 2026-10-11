import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const skills = await prisma.studentSkill.findMany({
      where: { userId: req.user!.id },
      include: { skill: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ skills: skills.map(({ skill, proficiency, experience, portfolioUrl }) => ({ ...skill, proficiency, experience, portfolioUrl })) });
  } catch (error) {
    console.error('Failed to list skills:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
  const proficiency = String(req.body?.proficiency || 'BEGINNER').toUpperCase();
  const experience = String(req.body?.experience || '').trim();
  const portfolioUrl = String(req.body?.portfolioUrl || '').trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'Skill name is required and must be 80 characters or fewer' });
  }
  if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].includes(proficiency)) {
    return res.status(400).json({ error: 'Choose a valid skill proficiency level' });
  }
  if (experience.length > 1200) return res.status(400).json({ error: 'Skill experience must be 1,200 characters or fewer' });
  if (portfolioUrl.length > 500 || (portfolioUrl && !/^https?:\/\/\S+$/i.test(portfolioUrl))) {
    return res.status(400).json({ error: 'Portfolio links must be valid HTTP or HTTPS URLs' });
  }

  try {
    const skill = await prisma.$transaction(async (transaction) => {
      let catalogSkill = await transaction.skill.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (!catalogSkill) {
        catalogSkill = await transaction.skill.create({ data: { name } });
      }

      const assignment = await transaction.studentSkill.findUnique({
        where: { userId_skillId: { userId: req.user!.id, skillId: catalogSkill.id } },
        select: { id: true },
      });
      if (assignment) throw new Error('SKILL_ALREADY_ASSIGNED');

      const createdAssignment = await transaction.studentSkill.create({
        data: { userId: req.user!.id, skillId: catalogSkill.id, proficiency, experience: experience || null, portfolioUrl: portfolioUrl || null },
      });
      return { ...catalogSkill, proficiency: createdAssignment.proficiency, experience: createdAssignment.experience, portfolioUrl: createdAssignment.portfolioUrl };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });

    res.status(201).json({ skill });
  } catch (error) {
    if (error instanceof Error && error.message === 'SKILL_ALREADY_ASSIGNED') {
      return res.status(409).json({ error: 'This skill is already on your profile' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      return res.status(409).json({ error: 'Your skill list changed; refresh and try again' });
    }
    console.error('Failed to add skill:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const skillId = Array.isArray(req.params.skillId) ? req.params.skillId[0] : req.params.skillId;
    if (!skillId) return res.status(400).json({ error: 'Missing skill id' });

    const result = await prisma.studentSkill.deleteMany({ where: { skillId, userId: req.user!.id } });
    if (!result.count) return res.status(404).json({ error: 'Skill assignment not found' });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove skill:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const skillId = Array.isArray(req.params.skillId) ? req.params.skillId[0] : req.params.skillId;
  const proficiency = String(req.body?.proficiency || '').toUpperCase();
  const experience = String(req.body?.experience || '').trim();
  const portfolioUrl = String(req.body?.portfolioUrl || '').trim();
  if (!skillId) return res.status(400).json({ error: 'Missing skill id' });
  if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].includes(proficiency)) {
    return res.status(400).json({ error: 'Choose a valid skill proficiency level' });
  }
  if (experience.length > 1200) return res.status(400).json({ error: 'Skill experience must be 1,200 characters or fewer' });
  if (portfolioUrl.length > 500 || (portfolioUrl && !/^https?:\/\/\S+$/i.test(portfolioUrl))) {
    return res.status(400).json({ error: 'Portfolio links must be valid HTTP or HTTPS URLs' });
  }
  try {
    const result = await prisma.studentSkill.updateMany({
      where: { userId: req.user!.id, skillId },
      data: { proficiency, experience: experience || null, portfolioUrl: portfolioUrl || null },
    });
    if (!result.count) return res.status(404).json({ error: 'Skill assignment not found' });
    const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    res.json({ skill: { ...skill, proficiency, experience: experience || null, portfolioUrl: portfolioUrl || null } });
  } catch (error) {
    console.error('Failed to update skill profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;