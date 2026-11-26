-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('android', 'ios', 'web');

-- CreateEnum
CREATE TYPE "PushIdKind" AS ENUM ('token', 'fid');

-- CreateTable
CREATE TABLE "push_tokens" (
    "token" TEXT NOT NULL,
    "kind" "PushIdKind" NOT NULL DEFAULT 'token',
    "platform" "PushPlatform" NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_sessionId_key" ON "push_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
