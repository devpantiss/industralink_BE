# API contract

> **This file is the source of truth for the API.** It started as the dashboard's contract.
> When an endpoint changes, update it here first. What is already built: see the README "API so far" table.
> The backend sends phone numbers as 10 digits (the apps add +91).

The endpoints the dashboard expects. The mock API in `src/mocks/handlers.ts` already implements all of them, so it doubles as a working reference.
The types (`User`, `Job`, …) are defined in `src/types/index.ts`.

## Version 1 decisions (locked 23 Nov 2026)

Both apps (web dashboard and mobile) follow this file. A change goes here first, then into the backend, then into both apps.

- **Account status** is `active | pending | blocked`. There is no `suspended`. Blocking can carry an optional `reason`, which is saved in the admin activity log only.
- **Not in version 1** (can be added later, in this order: contract → backend → both apps): the HR private note on a candidate, the offer "reply by" date, the interview `note`, the "date joined" when hiring, the "Best fit" candidate sort / `match` score, and the `verifiedAadhaar` / `verifiedIti` flags (documents are not verified).
- **Uploads** are real files (`multipart/form-data` with `file` and `type`), never JSON with a link.
- **Changing a candidate's stage** uses one flat body: `PATCH /employer/applications/:id` with `{ stage, note?, notify?, interview?, offer? }`.
- **Admin users list** takes `role` = `worker` or `employer` (there is no "all").

## Conventions

- Base URL: `/api/v1`. JSON in, JSON out.
- Auth: `Authorization: Bearer <token>` (token comes from the login endpoints).
- Errors: HTTP status + body `{ "message": "Human-friendly text", "code": "MACHINE_CODE" }`.
  The UI shows `message` directly to the user, so write it in plain words.
- `401` on any call logs the user out. `403` + `code: "BLOCKED"` means the account is suspended.
- Dates are ISO strings (`2026-11-06T10:00:00.000Z`). Money is whole rupees.

## Auth

| Method | Path                        | Body                                      | Returns               | Notable errors                                                                                           |
| ------ | --------------------------- | ----------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/otp/request`         | `{ phone }`                               | `{ sent, isNewUser }` | 400 `INVALID_PHONE`                                                                                      |
| POST   | `/auth/otp/verify`          | `{ phone, code, name? }` (name = sign up) | `AuthResponse`        | 400 `WRONG_OTP`, 404 `NOT_FOUND` (no account), 409 `EXISTS` (sign-up with a known number), 403 `BLOCKED` |
| POST   | `/auth/login`               | `{ email, password }`                     | `AuthResponse`        | 401 `INVALID_CREDENTIALS`, 403 `BLOCKED`                                                                 |
| POST   | `/auth/signup/employer`     | `{ name, email, password, companyName }`  | `AuthResponse`        | 409 `EXISTS`                                                                                             |
| GET    | `/auth/me`                  |                                           | `User`                | 401                                                                                                      |
| POST   | `/auth/logout`              |                                           | `{ ok }`              |                                                                                                          |
| POST   | `/auth/onboarding/complete` |                                           | `User`                |                                                                                                          |

## Notifications (all roles)

| Method | Path                      | Returns                                    |
| ------ | ------------------------- | ------------------------------------------ |
| GET    | `/notifications`          | `AppNotification[]` (newest first, max 30) |
| POST   | `/notifications/:id/read` | `{ ok }`                                   |
| POST   | `/notifications/read-all` | `{ ok }`                                   |

## Worker (role = worker)

| Method        | Path                                | Body / query                                                                | Returns                                                                                                     | Notable errors                                           |
| ------------- | ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GET           | `/worker/summary`                   |                                                                             | `WorkerSummary` (incl. `missing[]` that drives the profile banner)                                          |                                                          |
| GET           | `/jobs`                             | query: `JobSearchParams`                                                    | `Paginated<JobForWorker>` (page size 10, only active jobs whose `deadline` hasn't passed, unpaid jobs last) |                                                          |
| GET           | `/jobs/:id`                         |                                                                             | `JobForWorker` (**never includes `hrPhone`**)                                                               | 404 `NOT_FOUND`                                          |
| GET           | `/companies/:id`                    |                                                                             | `CompanyForWorker` (company **without `gstNumber` and `hrPhone`** + its open jobs)                          | 404                                                      |
| POST / DELETE | `/jobs/:id/save`                    |                                                                             | `{ saved }`                                                                                                 |                                                          |
| GET           | `/worker/saved`                     |                                                                             | `JobForWorker[]`                                                                                            |                                                          |
| POST          | `/jobs/:id/apply`                   | `{ sentWith: "profile" \| "document", documentId? }`                        | `Application`                                                                                               | 410 `JOB_CLOSED`, 409 `ALREADY_APPLIED`, 409 `WITHDRAWN` |
| GET           | `/worker/applications`              |                                                                             | `WorkerApplication[]`. `contact` is set only when stage ≥ shortlisted **and** `job.allowCalls`              |                                                          |
| GET           | `/worker/applications/:id`          |                                                                             | `WorkerApplication`                                                                                         | 404                                                      |
| POST          | `/worker/applications/:id/withdraw` |                                                                             | `WorkerApplication`                                                                                         | 409 `CLOSED`                                             |
| GET / PATCH   | `/worker/profile`                   | PATCH: `Partial<WorkerProfile>` (phone and verification can't be changed)   | `WorkerProfile`                                                                                             |                                                          |
| GET           | `/worker/documents`                 |                                                                             | `WorkerDocument[]` (no review status: documents are not verified)                                           |                                                          |
| POST          | `/worker/documents`                 | `multipart/form-data`: `file`, `type` (DocType). PDF/JPG/PNG/WEBP, max 5 MB | `WorkerDocument` (with a `url` to the stored file)                                                          | 415 `BAD_TYPE`, 413 `TOO_BIG`                            |
| DELETE        | `/worker/documents/:id`             |                                                                             | `{ ok }`                                                                                                    |                                                          |
| POST          | `/worker/documents/:id/default`     |                                                                             | `{ ok }`                                                                                                    |                                                          |

## Employer (role = employer)

| Method      | Path                              | Body / query                                                                                                                                                                                                                                                                    | Returns                                                                                     | Notable errors                                                                                                    |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET         | `/employer/summary`               |                                                                                                                                                                                                                                                                                 | `EmployerSummary`                                                                           |                                                                                                                   |
| GET         | `/employer/jobs`                  | query: `status?`                                                                                                                                                                                                                                                                | `Job[]`                                                                                     |                                                                                                                   |
| GET         | `/employer/jobs/:id`              |                                                                                                                                                                                                                                                                                 | `Job`                                                                                       | 404                                                                                                               |
| POST        | `/employer/jobs`                  | `JobInput`                                                                                                                                                                                                                                                                      | `Job`                                                                                       | 422 `VALIDATION`, 403 `NOT_VERIFIED` (publishing before company is approved)                                      |
| PATCH       | `/employer/jobs/:id`              | `Partial<JobInput>`                                                                                                                                                                                                                                                             | `Job`                                                                                       | 422, 403 `NOT_VERIFIED`                                                                                           |
| DELETE      | `/employer/jobs/:id`              |                                                                                                                                                                                                                                                                                 | `{ ok }`                                                                                    | 409 `HAS_APPLICANTS` (close it instead)                                                                           |
| GET         | `/employer/jobs/:id/candidates`   |                                                                                                                                                                                                                                                                                 | `Candidate[]` incl. the worker's `documents` (also resets the job's "new applicants" count) |                                                                                                                   |
| GET         | `/employer/candidates`            | query: `q?`, `stage?`, `jobId?`                                                                                                                                                                                                                                                 | `Candidate[]` across all the company's jobs                                                 |                                                                                                                   |
| PATCH       | `/employer/applications/:id`      | `{ stage, note?, notify?, interview?: { at, place, contactPerson?, bring? }, offer?: { pay, payPeriod, payType?, joiningDate, place, note? } }`. `offer` is required when `stage` is `offer`; sending it again while in `offer` updates the offer and clears the worker's reply | `Candidate`                                                                                 | 409 `WITHDRAWN`, 422 (interview time in the past, offer without pay / joining date / place)                       |
| POST        | `/employer/applications/:id/view` |                                                                                                                                                                                                                                                                                 | `{ ok }`                                                                                    | Adds a `viewed` timeline event once ("Seen by employer" for the worker). Any stage change also adds it if missing |
| GET / PATCH | `/employer/company`               | PATCH: `Partial<Company>` + `resubmit?: boolean`                                                                                                                                                                                                                                | `Company`                                                                                   | 422 (bad `hrPhone` / `pincode`). Changing `name` or `logoUrl` also updates the company's jobs                     |
| GET         | `/employer/company/documents`     |                                                                                                                                                                                                                                                                                 | `CompanyDocument[]`                                                                         | Verification proof. Only the company and admins see these                                                         |
| POST        | `/employer/company/documents`     | `multipart/form-data`: `file`, `type` (`gst` \| `udyam` \| `cin` \| `other`). PDF/JPG/PNG/WEBP, max 5 MB                                                                                                                                                                        | `CompanyDocument`                                                                           | 415, 413                                                                                                          |
| DELETE      | `/employer/company/documents/:id` |                                                                                                                                                                                                                                                                                 | `{ ok }`                                                                                    | 409 `LOCKED` once the company is approved                                                                         |

Moving a candidate sends the worker a notification (rejection only if `notify` isn't `false`).

## Admin (role = admin)

| Method | Path                               | Body / query                                   | Returns                                                                                                                                              | Notable errors                                  |
| ------ | ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/admin/summary`                   |                                                | `AdminSummary`                                                                                                                                       |                                                 |
| GET    | `/admin/verifications`             | query: `status?` (default pending)             | `VerificationItem[]` (companies only). `documents` = the company's uploaded `CompanyDocument`s; `details` include HR mobile, address and "Hiring as" |                                                 |
| POST   | `/admin/verifications/company/:id` | `{ decision: "approve" \| "reject", reason? }` | `{ ok }`                                                                                                                                             | 422 (reject without reason), 409 `ALREADY_DONE` |
| GET    | `/admin/jobs`                      | query: `q?`, `status?`                         | `AdminJobRow[]`                                                                                                                                      |                                                 |
| POST   | `/admin/jobs/:id/remove`           | `{ reason }`                                   | `{ ok }` (closes the job, tells the company)                                                                                                         | 422                                             |
| GET    | `/admin/users`                     | query: `role`, `q?`, `status?`                 | `AdminUserRow[]`                                                                                                                                     |                                                 |
| PATCH  | `/admin/users/:id`                 | `{ status, reason? }`                          | `{ ok }`                                                                                                                                             | 400 `SELF`                                      |
| GET    | `/admin/user-impact/:id`           |                                                | `{ activeJobs, applicants }` (shown before blocking a company)                                                                                       |                                                 |
| GET    | `/admin/audit`                     |                                                | `AuditEntry[]`                                                                                                                                       |                                                 |

Every admin decision is written to the audit log.

## Added after the gap review

Shapes are in `src/types/index.ts`. Mock versions are in `src/mocks/handlers.ts`.

### Public (no login)

| Method | Path                    | Body / query                          | Returns                 | Notes                                                                                                                       |
| ------ | ----------------------- | ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/public/jobs/:id`      |                                       | `Job` without `hrPhone` | The page a shared WhatsApp link opens. 404 for drafts or blocked companies.                                                 |
| POST   | `/support`              | `{ topic, message, name?, contact? }` | `{ ok }`                | Help request. If logged in, contact comes from the account.                                                                 |
| POST   | `/auth/password/forgot` | `{ email }`                           | `{ ok }`                | Same reply whether or not the email exists. The real API emails a link valid for 1 hour (the mock returns `demoResetLink`). |
| POST   | `/auth/password/reset`  | `{ token, password }`                 | `{ ok, role }`          | 410 `EXPIRED`, 422                                                                                                          |

### Any logged-in user

| Method      | Path                       | Body / query            | Returns                           | Notes                                                                                                                               |
| ----------- | -------------------------- | ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| POST        | `/auth/password/change`    | `{ current, next }`     | `{ ok }`                          | Employer/admin only. 422 `WRONG_PASSWORD`                                                                                           |
| GET / PATCH | `/me/settings`             | `Partial<UserSettings>` | `UserSettings`                    | Language, alerts, "let companies find me"                                                                                           |
| POST        | `/me/delete`               | `{ confirm: "DELETE" }` | `{ ok }`                          | Worker: personal data erased, open applications withdrawn. Employer: company hidden, jobs closed. (DPDP Act)                        |
| GET         | `/messages`                |                         | `MessageThread[]`                 | One thread per application, from shortlisted onwards                                                                                |
| GET         | `/messages/:applicationId` |                         | `{ thread, messages: Message[] }` | Also marks the thread as read                                                                                                       |
| POST        | `/messages/:applicationId` | `{ text }` (max 1000)   | `Message`                         | 403 `NOT_ALLOWED` before shortlisting or after closing, 403 `DISABLED` when admin turned messaging off. Admins can't read messages. |

### Worker

| Method | Path                                          | Body / query                                        | Returns                   | Notes                                                                                    |
| ------ | --------------------------------------------- | --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/jobs/:id/report`                            | `{ reason, details? }`                              | `{ ok }`                  | reason: `asks_money \| fake \| wrong_details \| unsafe \| other`. 409 `ALREADY_REPORTED` |
| POST   | `/worker/applications/:id/interview-response` | `{ response: "attending" \| "cant_attend", note? }` | `WorkerApplication`       | Tells HR. Rescheduling clears the reply.                                                 |
| POST   | `/worker/applications/:id/offer-response`     | `{ response: "accepted" \| "declined", note? }`     | `WorkerApplication`       | Declining sets stage `withdrawn`                                                         |
| GET    | `/companies`                                  | query: `q?`, `sector?`                              | `{ company, openJobs }[]` | Approved companies only                                                                  |

`WorkerProfile` gained `languages`, `safetyTrainingHours`, `employmentType` and `photoUrl`, all optional.

### Employer

| Method | Path                                | Body / query                                               | Returns             | Notes                                                                                                 |
| ------ | ----------------------------------- | ---------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/employer/talent`                  | query: `q?`, `trade?`, `experience?`, `city?`, `relocate?` | `TalentProfile[]`   | Only workers with `visibleToEmployers`. No phone, email or documents. 403 `NOT_VERIFIED` / `DISABLED` |
| POST   | `/employer/talent/:workerId/invite` | `{ jobId }`                                                | `{ ok }`            | Notifies the worker. 409 if already applied or invited                                                |
| GET    | `/employer/analytics`               |                                                            | `EmployerAnalytics` |                                                                                                       |

`Company` gained `hrName`, `hrDesignation` and `sites`. Moving an interview that's already scheduled notifies the worker.

### Admin

| Method      | Path                       | Body / query                                         | Returns                                      | Notes                                                     |
| ----------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| GET         | `/admin/reports`           | query: `status?` (open, dismissed, job_removed, all) | `JobReport[]` + `jobStatus`, `reportsForJob` |                                                           |
| POST        | `/admin/reports/:id`       | `{ action: "dismiss" \| "remove_job", note? }`       | `{ ok }`                                     | Removing closes the job and resolves all its open reports |
| GET         | `/admin/support`           | query: `status?`                                     | `SupportTicket[]`                            |                                                           |
| POST        | `/admin/support/:id/close` |                                                      | `{ ok }`                                     | Notifies the user                                         |
| GET / PATCH | `/admin/settings`          | `Partial<PlatformSettings>`                          | `PlatformSettings`                           | Messaging, Find workers, auto-approve. Logged.            |

`AdminSummary` gained `openReports` and `openTickets`.

## Added for the data gaps (Nov 2026)

**Privacy rule for every worker response:** `rejectionNote` and the `note` on a `rejected` timeline event are for HR only ("only you see this"). Strip them from `WorkerApplication` (list, detail, withdraw, interview / offer replies). Company `gstNumber` and `hrPhone` are never sent to workers.

New optional fields (all optional, so old data still works):

- `Company`: `logoUrl`, `hrPhone`, `address`, `pincode`, `hiringType` (`direct` \| `agency`).
- `Job`: `companyLogoUrl` (copied from the company, like `companyName`), `licences[]` (same list as worker licences), `payType` (`in_hand` \| `ctc`), `workHours`, `contractLength` (contract jobs), `address`, `pincode`. Publishing needs `location.state`.
- `WalkIn`: `endDate`, `endTime`, `contactPerson`, `bring`.
- `Interview`: `contactPerson`, `bring`.
- `Application.offer`: `{ pay, payPeriod, payType?, joiningDate, place, note?, sentAt }`.
- `WorkerProfile.workHistory[]`: `{ company, role, from, to? }` (years; no `to` = still there).

Backend still to do: close jobs automatically at `deadline` (search already hides them), real distance for "Near me" (needs coordinates), email verification for employers.

## Backend notes (applying and hiring, Nov 2026)

- `POST /jobs/:id/apply` returns `WorkerApplication` (201). `sentWith: "document"` needs one of the worker's own `documentId`s, else 422 `NO_DOCUMENT`.
- `POST /worker/applications/:id/interview-response`: 409 `NO_INTERVIEW` when there is no interview. `offer-response`: 409 `NO_OFFER` when there is no offer.
- `PATCH /employer/applications/:id`: `stage` is one of `shortlisted | interview | offer | hired | rejected`. A missing interview or offer gives 422. Rescheduling the interview clears the worker's reply.
- HR gets a notification when a worker applies, withdraws, or replies to an interview or offer.
- `PATCH /employer/company`: if an **approved** company changes its `name` or `gstNumber`, it goes back to `verification: "pending"` for admin review. Its jobs are hidden from workers until it is approved again.

## Backend notes (home screens and notifications, Nov 2026)

- `GET /worker/summary`: `nextStep` is the next upcoming interview, or else an offer waiting for a reply.
- `GET /employer/summary`: `attention` also lists interviews the worker can't attend (`action: "New time"`). `applicantsPerDay` covers the last 7 days in India time.
- `GET /admin/summary`: `signupsPerWeek` uses real sign-ups only (6 weeks).
- `GET /admin/users`: query `role` (`worker` default \| `employer`), `q?`, `status?`. Max 300 rows, newest first. An employer whose company is blocked shows as `blocked`.
- `GET /admin/user-impact/:id`: `{ activeJobs, applicants }` for an employer; zeros for others.
- `POST /notifications/:id/read` answers `{ ok }` even for an unknown id (nothing changes).

## Also available (not in the tables above)

| Method | Path                        | Body / query                               | Returns                   | Notes                                                                         |
| ------ | --------------------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/public/jobs`              | query: `JobSearchParams`                   | `Paginated<JobForWorker>` | Job search without login (landing site). Same filters as `/jobs`, no `saved`. |
| DELETE | `/jobs/:id/save`            |                                            | `{ saved: false }`        | Unsave a job.                                                                 |
| GET    | `/auth/dev-users`           |                                            | demo accounts             | **Development only** (`DEV_LOGIN=true`). Never on the live server.            |
| POST   | `/auth/dev-login`           | `{ phone }` or `{ email }` or `{ userId }` | `AuthResponse`            | **Development only.** The apps' "Quick demo login" uses it.                   |
| POST   | `/auth/dev-signup/worker`   | `{ name, phone }`                          | `AuthResponse`            | **Development only.** Test sign-up until the real login exists.               |
| POST   | `/auth/dev-signup/employer` | `{ name, email, companyName }`             | `AuthResponse`            | **Development only.**                                                         |

## Backend notes (reports, help, delete account, admin tools – Nov 2026)

- `POST /jobs/:id/report` → 201 `{ ok }`. `details` is required when `reason` is `other`. 409 `ALREADY_REPORTED` while the same worker's report is still open. Every admin gets a notification.
- `POST /admin/reports/:id`: `remove_job` uses `note` as the removal reason (default "Reported by workers and checked by our team"), closes the job and marks every open report for it `job_removed`. 409 `ALREADY_DONE` for a handled report.
- `POST /support` → 201 `{ ok }`. Works with or without login (an expired token counts as a guest). Logged in: name and contact come from the account. Guest: `contact` (email or 10-digit mobile) is required. Limited to 5 per 10 minutes per IP.
- `POST /admin/support/:id/close`: closing twice is fine. The user gets a notification if they have an account.
- `POST /me/delete` with `{ confirm: "DELETE" }`: the account shows as "Deleted user", phone/email/profile/documents/photo/saved jobs are erased, open applications are withdrawn, every login ends. Employer: open jobs close; the company is hidden when no other HR user is left. Admins get 403 `ADMIN`. A deleted account gets 401 `ACCOUNT_DELETED`.
- `GET /admin/audit`: newest 100 entries, in words (e.g. `action: "Blocked user"`, `target: "Raju – Asked workers for money"`).
- `PATCH /admin/settings`: only real changes are logged. `autoApproveCompanies` applies to new employer sign-ups; `messagingEnabled` and `talentSearchEnabled` are used by chat and Find workers.

## Backend notes (chat – Nov 2026)

- One chat per application, between the worker and the company's HR users (they share it). It opens when HR moves the worker to **shortlisted** (or later) and is never deleted. Messages are kept.
- Either side can write first. It stays open through interview, offer and **hired**.
- Read-only (`canSend: false`, sending gives 403 `NOT_ALLOWED`): rejected or withdrawn, job removed by admin, worker blocked or deleted, company blocked. Messaging off gives 403 `DISABLED`. Reading always works.
- Not your chat → 404. Your application but not shortlisted yet → 403 `NOT_ALLOWED`. Admins → 403.
- `GET /messages/:applicationId` → `{ thread, messages, hasMore }`, messages oldest first:
  - no query: the newest 50, and marks the chat read for your side;
  - `?before=<messageId>`: the 50 before it (scrolling up);
  - `?after=<messageId>`: only newer ones (up to 200; refresh / catch-up). Doesn't mark read.
  - A message id from another chat → 422 `BAD_CURSOR`.
- `POST /messages/:applicationId/read` → `{ ok }`: marks read without loading messages.
- `POST /messages/:applicationId` `{ text, clientId? }` → 201 `Message`. Text is trimmed, invisible characters are removed, line breaks are kept (at most 10 in a row), 1–1000 characters. `clientId` (app-made, letters/numbers/`-`/`_`, up to 64): sending the same one again returns the first message with 200 instead of saving a copy. 20 messages a minute per person (429).
- `Message` also has, **only on your own messages**: `clientId?` and `seen` (the other side opened the chat after it was sent).
- `unread` in `MessageThread` is the number of messages from the other side since you last opened the chat. Writing a message also counts as reading.
- Chat messages don't create bell notifications; the Messages badge shows `unread`.
- The inbox answers 304 when nothing changed (ETag), so polling is cheap.

## Live chat updates (WebSocket – Nov 2026)

Address: `ws://<host>/ws` (`wss://` on the live server), same port as the API. Workers and HR only.

1. Connect, then send the login as the **first** message (never in the URL): `{ "type": "auth", "token": "<login token>" }`
2. The server answers `{ "type": "ready" }`. No login within 10 s → closed.
3. Events from the server (only "something changed"; load the data through the normal API):

| Event               | Fields                                       | What the app does                                                                         |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `message:new`       | `message` (a `Message`, as you would see it) | Add it / refresh the chat and the inbox                                                   |
| `chat:read`         | `applicationId`, `side`, `at`                | `side` = who opened the chat. Refresh: ticks turn ✓✓, or your other device's badge clears |
| `chat:typing`       | `applicationId`, `side`                      | Show "typing…" for about 4 s                                                              |
| `chat:changed`      | `applicationId`                              | The chat opened, closed or changed stage: refresh it                                      |
| `messaging:changed` | `enabled`                                    | Admin switched messaging: refresh chats                                                   |

4. The app may send `{ "type": "typing", "applicationId": "..." }` (the server passes on at most one every 2.5 s). **Sending messages stays on `POST /messages/:applicationId`.**

Close codes: `4001` log in again (logged out, blocked, session ended – don't retry) · `4003` admins (don't retry) · `4008` no login in time · `4029` more than 10 connections for one person. Anything else: reconnect after 1 s, 2 s, 5 s, 10 s, 30 s…, then reload the chats (or use `?after=`), so nothing is missed.

The server pings every 30 s and checks the session again; logging out or blocking closes the connection at once. Browsers from sites not in `CORS_ORIGINS` are refused (the phone app sends no origin and just logs in).
