CREATE TABLE IF NOT EXISTS "TeamPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "reqSkills" TEXT,
  "requirements" TEXT,
  "teamSize" INTEGER,
  "deadline" TIMESTAMP(3),
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamPost_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TeamMembership" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TeamPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TeamJoinRequest" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamJoinRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamJoinRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TeamPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamJoinRequest_teamId_userId_key" ON "TeamJoinRequest"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "TeamPost_creatorId_createdAt_idx" ON "TeamPost"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeamJoinRequest_teamId_status_idx" ON "TeamJoinRequest"("teamId", "status");
CREATE INDEX IF NOT EXISTS "TeamJoinRequest_userId_status_idx" ON "TeamJoinRequest"("userId", "status");