CREATE TABLE IF NOT EXISTS "AcademicIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "degree" TEXT,
  "stream" TEXT,
  "branch" TEXT,
  "specialization" TEXT,
  "institution" TEXT,
  "year" TEXT,
  "semester" TEXT,
  "session" TEXT,
  "github" TEXT,
  "linkedin" TEXT,
  "portfolio" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicIdentity_userId_key" UNIQUE ("userId"),
  CONSTRAINT "AcademicIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AcademicIdentity_isPublic_idx" ON "AcademicIdentity"("isPublic");