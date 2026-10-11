ALTER TABLE "TeamPost"
  ADD COLUMN IF NOT EXISTS "roles" JSONB;

UPDATE "TeamPost"
SET "roles" = jsonb_build_array(jsonb_build_object(
  'title', 'General Member',
  'responsibilities', COALESCE("requirements", ''),
  'requiredSkills', COALESCE("reqSkills", ''),
  'openings', GREATEST(COALESCE("teamSize", 4) - 1, 1)
))
WHERE "roles" IS NULL;

UPDATE "TeamPost"
SET "deadline" = "createdAt" + INTERVAL '7 days'
WHERE "deadline" IS NULL;

ALTER TABLE "TeamMembership"
  ADD COLUMN IF NOT EXISTS "position" TEXT;

UPDATE "TeamMembership" AS membership
SET "position" = request."roleAppliedFor"
FROM "TeamJoinRequest" AS request
WHERE request."teamId" = membership."teamId"
  AND request."userId" = membership."userId"
  AND request."status" = 'ACCEPTED'
  AND request."roleAppliedFor" IS NOT NULL
  AND membership."position" IS NULL;

ALTER TABLE "TeamJoinRequest"
  ADD COLUMN IF NOT EXISTS "recruiterNotes" TEXT;

ALTER TABLE "StudentSkill"
  ADD COLUMN IF NOT EXISTS "proficiency" TEXT NOT NULL DEFAULT 'BEGINNER',
  ADD COLUMN IF NOT EXISTS "experience" TEXT,
  ADD COLUMN IF NOT EXISTS "portfolioUrl" TEXT;
