CREATE TABLE IF NOT EXISTS "Skill" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudentSkill" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentSkill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "HelpService" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "price" DOUBLE PRECISION,
  "skills" TEXT,
  "availability" TEXT,
  "expectedTimeline" TEXT,
  "paymentMethod" TEXT,
  "upiId" TEXT,
  "paymentQrUrl" TEXT,
  "paymentInstructions" TEXT,
  "providerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HelpService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpService_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "HelpRequest" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT,
  "requesterId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HelpRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "HelpService"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "HelpRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HelpRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ServiceReview" (
  "id" TEXT NOT NULL,
  "helpRequestId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceReview_helpRequestId_fkey" FOREIGN KEY ("helpRequestId") REFERENCES "HelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceReview_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "HelpService"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceReview_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Skill_name_key" ON "Skill"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentSkill_userId_skillId_key" ON "StudentSkill"("userId", "skillId");
CREATE UNIQUE INDEX IF NOT EXISTS "HelpRequest_requesterId_serviceId_key" ON "HelpRequest"("requesterId", "serviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceReview_helpRequestId_key" ON "ServiceReview"("helpRequestId");
CREATE INDEX IF NOT EXISTS "HelpService_providerId_createdAt_idx" ON "HelpService"("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "HelpRequest_providerId_status_idx" ON "HelpRequest"("providerId", "status");
CREATE INDEX IF NOT EXISTS "HelpRequest_requesterId_status_idx" ON "HelpRequest"("requesterId", "status");