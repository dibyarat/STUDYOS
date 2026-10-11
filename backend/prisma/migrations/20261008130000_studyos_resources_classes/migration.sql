ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

CREATE TABLE IF NOT EXISTS "Resource" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "subject" TEXT,
  "topic" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "price" DOUBLE PRECISION,
  "paymentMethod" TEXT,
  "upiId" TEXT,
  "paymentInst" TEXT,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Resource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Resource_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceFile" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceFile_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceLink" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceLink_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceTag" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  CONSTRAINT "ResourceTag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceTag_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceSave" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceSave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResourceSave_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceRating" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceRating_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResourceRating_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ResourceReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResourceReport_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VirtualStudyClass" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualStudyClass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VirtualStudyClass_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VirtualStudyTopic" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualStudyTopic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VirtualStudyTopic_classId_fkey" FOREIGN KEY ("classId") REFERENCES "VirtualStudyClass"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VirtualStudyResource" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "resourceId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VirtualStudyResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VirtualStudyResource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "VirtualStudyTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VirtualStudyResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ResourceSave_userId_resourceId_key" ON "ResourceSave"("userId", "resourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ResourceRating_userId_resourceId_key" ON "ResourceRating"("userId", "resourceId");
CREATE INDEX IF NOT EXISTS "Resource_creatorId_createdAt_idx" ON "Resource"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Resource_visibility_createdAt_idx" ON "Resource"("visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "ResourceFile_resourceId_idx" ON "ResourceFile"("resourceId");
CREATE INDEX IF NOT EXISTS "ResourceLink_resourceId_idx" ON "ResourceLink"("resourceId");
CREATE INDEX IF NOT EXISTS "ResourceTag_resourceId_idx" ON "ResourceTag"("resourceId");
CREATE INDEX IF NOT EXISTS "ResourceSave_userId_idx" ON "ResourceSave"("userId");
CREATE INDEX IF NOT EXISTS "ResourceRating_resourceId_idx" ON "ResourceRating"("resourceId");
CREATE INDEX IF NOT EXISTS "ResourceReport_resourceId_createdAt_idx" ON "ResourceReport"("resourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "VirtualStudyClass_creatorId_createdAt_idx" ON "VirtualStudyClass"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "VirtualStudyTopic_classId_order_idx" ON "VirtualStudyTopic"("classId", "order");
CREATE INDEX IF NOT EXISTS "VirtualStudyResource_topicId_idx" ON "VirtualStudyResource"("topicId");