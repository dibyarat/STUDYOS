CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "technology" TEXT,
  "githubUrl" TEXT,
  "demoUrl" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Project_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProjectFile" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProjectTag" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Project_creatorId_createdAt_idx" ON "Project"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Project_visibility_createdAt_idx" ON "Project"("visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectTag_projectId_idx" ON "ProjectTag"("projectId");