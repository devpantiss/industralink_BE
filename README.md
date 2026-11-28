# IndustriaLink API

Backend for the IndustriaLink dashboard and mobile app.
Node.js 24 · Express 5 · TypeScript · PostgreSQL · Prisma 7

## Run locally

Needs Node 24+ and Docker.

```bash
npm install
cp .env.example .env        # then set JWT_SECRET
npm run db:up               # start Postgres in Docker
npm run db:migrate          # create tables
npm run db:seed             # demo data
npm run dev                 # http://localhost:4000
```

Check: `curl localhost:4000/health` → `{"status":"ok","database":"up"}`

## Scripts

| Script                          | What it does                                                      |
| ------------------------------- | ----------------------------------------------------------------- |
| `dev`                           | Start with auto-reload                                            |
| `build` / `start`               | Production build and run                                          |
| `test`                          | Tests (use the separate `industrialink_test` database)            |
| `typecheck` / `lint` / `format` | Code checks                                                       |
| `db:migrate`                    | After changing `prisma/schema.prisma`: create + apply a migration |
| `db:seed`                       | Clear all data and uploads, then load demo data (local only)      |
| `db:clear`                      | Clear all data and uploads, no demo data (local only)             |
| `db:reset`                      | Drop everything, re-run migrations and seed                       |
| `db:studio`                     | Browse the database in the browser                                |
| `push:test -- --phone <number>` | Send a test push to that person's phones (needs the Firebase key) |

## Folder structure

```
prisma/schema.prisma     all tables
prisma/seed.ts           demo data
src/app.ts               Express app (middleware, routes)
src/server.ts            starts the server
src/routes.ts            mounts every module under /api/v1
src/config/env.ts        checked environment variables
src/db/prisma.ts         database client
src/lib/                 small helpers (errors, jwt, logger, phone)
src/middleware/          requireAuth, requireRole, errors, 404, rate limit
src/modules/<feature>/   routes → controller → service (+ schemas, mapper)
tests/                   API tests
```

Who may call what is set in one place: `src/routes.ts`.

Rules: routes only wire URLs; controllers read the request and reply; services hold the logic and
database calls; mappers decide which fields leave the API.

File names: `<feature>.routes.ts`, `.controller.ts`, `.service.ts`, `.schemas.ts` (Zod input checks),
`.mapper.ts` (database row -> API response). A part used by one audience gets its own prefix,
e.g. `employer-jobs.service.ts`, `job-search.controller.ts`. Input checks never live in routes or controllers.

## API so far

All errors look like `{ "message": "...", "code": "..." }`. Phones go out as 10 digits.

Full details (bodies, answers, errors): `docs/API_CONTRACT.md`. All paths below start with `/api/v1`.

| Who       | Routes                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone    | `GET /health` (no `/api/v1`), `GET /public/jobs`, `GET /public/jobs/:id`, `GET /files/...` (signed links), `POST /support` (help form; login optional), `POST /auth/signup/worker`, `POST /auth/signup/employer`, `POST /auth/login`, `POST /auth/google`                                                                                                                        |
| Logged in | `GET /auth/me`, `POST /auth/logout`, `POST /auth/onboarding/complete`, `POST /auth/password/change`, `GET/PATCH /me/settings`, `PUT /me/phone`, `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `PUT/DELETE /me/push-token`, `POST /me/delete`                                                                                             |
| Worker    | `GET /worker/summary`, `GET/PATCH /worker/profile`, `GET/POST /worker/documents`, `DELETE /worker/documents/:id`, `POST /worker/documents/:id/default`                                                                                                                                                                                                                           |
| Worker    | `GET /jobs`, `GET /jobs/:id`, `POST/DELETE /jobs/:id/save`, `GET /worker/saved`, `GET /companies`, `GET /companies/:id`, `POST /jobs/:id/report`                                                                                                                                                                                                                                 |
| Worker    | `POST /jobs/:id/apply`, `GET /worker/applications`, `GET /worker/applications/:id`, `POST /worker/applications/:id/withdraw`, `POST /worker/applications/:id/interview-response`, `POST /worker/applications/:id/offer-response`                                                                                                                                                 |
| Employer  | `GET /employer/summary`, `GET/PATCH /employer/company`, `GET/POST /employer/company/documents`, `DELETE /employer/company/documents/:id`                                                                                                                                                                                                                                         |
| Employer  | `GET/POST /employer/jobs`, `GET/PATCH/DELETE /employer/jobs/:id`                                                                                                                                                                                                                                                                                                                 |
| Employer  | `GET /employer/jobs/:id/candidates`, `GET /employer/candidates`, `PATCH /employer/applications/:id`, `POST /employer/applications/:id/view`                                                                                                                                                                                                                                      |
| Admin     | `GET /admin/summary`, `GET /admin/users`, `GET /admin/user-impact/:id`, `GET /admin/verifications`, `POST /admin/verifications/company/:id`, `GET /admin/jobs`, `POST /admin/jobs/:id/remove`, `PATCH /admin/users/:id`, `GET /admin/reports`, `POST /admin/reports/:id`, `GET /admin/support`, `POST /admin/support/:id/close`, `GET /admin/audit`, `GET/PATCH /admin/settings` |
| Chat      | Workers and HR (not admins): `GET /messages`, `GET /messages/:applicationId` (`?before=` / `?after=`), `POST /messages/:applicationId`, `POST /messages/:applicationId/read`                                                                                                                                                                                                     |
| Live      | `ws://<host>/ws`: live chat updates (new message, seen, typing). Log in with `{ type: "auth", token }` as the first message. See `docs/API_CONTRACT.md`.                                                                                                                                                                                                                         |
| Dev only  | `GET /auth/dev-users`, `POST /auth/dev-login`                                                                                                                                                                                                                                                                                                                                    |

Dev login (one-tap demo logins for building the apps) is **not available in production**.

Demo logins: `admin@industrialink.demo`, `hr@konark.demo`, `hr@westcoast.demo`, worker phone `9876543210`.

## Testing

**1. Automatic tests** (do this before every commit)

```bash
npm run db:up      # database must be running
npm test           # about 257 tests, uses the separate test database
```

**2. By hand with the Postman app**

1. `npm run db:seed` for fresh demo data, then `npm run dev`.
2. In the Postman app: **Import** → pick the file `postman/IndustriaLink.postman_collection.json`.
3. Run folder **0. Start here** first (it logs in and saves the tokens), then any other request,
   or right-click the collection → **Run collection** to run all 121 requests.
4. Bodies must be **raw → JSON** (a "Text" body gets `415 NOT_JSON`).
   For the 2 upload requests, choose a file once: `postman/sample-resume.pdf`.

**3. Look inside the database:** `npm run db:studio` opens it in the browser.

**4. Start again with clean demo data:** `npm run db:seed` (only works on a database on this computer).

## Push notifications

Every bell notification is also sent as a push to the person's phones, and every new chat message
goes to the other side's phones (grouped per chat). The phone app registers itself with
`PUT /me/push-token` after login; logout, blocking and deleting the account stop the pushes.

Push is off until `FIREBASE_SERVICE_ACCOUNT` is set in `.env` (the Firebase service account JSON as
base64). Everything else works without it. Code: `src/modules/push/`.

## Google sign-in

`POST /auth/google` signs workers and HR in, or creates their account, with the ID token the app
gets from Google (Android one-tap sheet, or Google's web button). The token is checked on this
server with Google's public keys (`google-auth-library`), so it is free.

It is off until `GOOGLE_CLIENT_IDS` is set in `.env` (our OAuth client IDs, comma separated; not
secret). Code: `src/modules/auth/google-auth.service.ts` and `google-verifier.ts`. All cases are in
`docs/API_CONTRACT.md`.

## Files

Uploads (PDF, JPG, PNG, WEBP, max 5 MB) are checked by their real content and saved in `UPLOAD_DIR`
for now. The API returns links that expire. Moving to a storage service later only changes
`src/modules/files/storage.ts`.
