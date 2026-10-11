ALTER TABLE "TeamJoinRequest"
  ADD COLUMN IF NOT EXISTS "roleAppliedFor" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationData" JSONB;

ALTER TABLE "LabRecord"
  ALTER COLUMN "experimentNo" DROP NOT NULL,
  ALTER COLUMN "subjectId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "fileReference" TEXT,
  ADD COLUMN IF NOT EXISTS "fileName" TEXT,
  ADD COLUMN IF NOT EXISTS "fileMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "uploaderId" TEXT;

ALTER TABLE "LabRecord"
  ADD CONSTRAINT "LabRecord_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "LabRecord_uploaderId_createdAt_idx"
  ON "LabRecord"("uploaderId", "createdAt");

ALTER TABLE "HelpService"
  ADD COLUMN IF NOT EXISTS "deliverables" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredSchedule" TEXT,
  ADD COLUMN IF NOT EXISTS "responseTime" TEXT;

ALTER TABLE "HelpRequest"
  ADD COLUMN IF NOT EXISTS "triedSoFar" TEXT,
  ADD COLUMN IF NOT EXISTS "projectContext" TEXT,
  ADD COLUMN IF NOT EXISTS "expectedOutcome" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "communicationMethod" TEXT;
