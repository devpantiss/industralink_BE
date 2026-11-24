-- Chat: one conversation row per application, and message changes.

-- ── messages ──
DROP INDEX "messages_applicationId_createdAt_idx";

-- "Seen" now comes from the conversation's last-read times, not a flag per message.
ALTER TABLE "messages" DROP COLUMN "readAt",
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "senderRole" "Role";

-- Fill the sender's role for any old messages, then make it required.
UPDATE "messages" m SET "senderRole" = u."role" FROM "users" u WHERE u."id" = m."senderId";
ALTER TABLE "messages" ALTER COLUMN "senderRole" SET NOT NULL;

CREATE INDEX "messages_applicationId_createdAt_id_idx" ON "messages"("applicationId", "createdAt", "id");
CREATE UNIQUE INDEX "messages_senderId_clientId_key" ON "messages"("senderId", "clientId");

-- ── conversations ──
CREATE TABLE "conversations" (
    "applicationId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageText" TEXT,
    "lastSenderId" UUID,
    "workerUnread" INTEGER NOT NULL DEFAULT 0,
    "companyUnread" INTEGER NOT NULL DEFAULT 0,
    "workerLastReadAt" TIMESTAMP(3),
    "companyLastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("applicationId")
);

CREATE INDEX "conversations_workerId_lastMessageAt_idx" ON "conversations"("workerId", "lastMessageAt" DESC);
CREATE INDEX "conversations_companyId_lastMessageAt_idx" ON "conversations"("companyId", "lastMessageAt" DESC);

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chats for applications that were already shortlisted (or later), or already have messages.
-- Old messages count as read, so nobody gets a sudden pile of unread chats.
INSERT INTO "conversations" ("applicationId", "workerId", "companyId", "lastMessageAt", "lastMessageText", "lastSenderId", "createdAt")
SELECT a."id", a."workerId", j."companyId", last."createdAt", LEFT(last."text", 120), last."senderId", a."updatedAt"
FROM "applications" a
JOIN "jobs" j ON j."id" = a."jobId"
LEFT JOIN LATERAL (
    SELECT m."createdAt", m."text", m."senderId" FROM "messages" m
    WHERE m."applicationId" = a."id"
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT 1
) last ON TRUE
WHERE a."stage" IN ('shortlisted', 'interview', 'offer', 'hired')
   OR EXISTS (SELECT 1 FROM "messages" m WHERE m."applicationId" = a."id");
