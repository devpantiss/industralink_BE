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
| `db:seed`                       | Clear all tables and load demo data                               |
| `db:reset`                      | Drop everything, re-run migrations and seed                       |
| `db:studio`                     | Browse the database in the browser                                |

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

| Method      | Path                                                                | Who       |
| ----------- | ------------------------------------------------------------------- | --------- |
| GET         | `/health`                                                           | –         |
| GET         | `/api/v1/auth/me`                                                   | logged in |
| POST        | `/api/v1/auth/logout`                                               | logged in |
| POST        | `/api/v1/auth/onboarding/complete`                                  | logged in |
| GET / PATCH | `/api/v1/me/settings`                                               | logged in |
| GET / PATCH | `/api/v1/worker/profile`                                            | worker    |
| GET / POST  | `/api/v1/worker/documents`                                          | worker    |
| DELETE      | `/api/v1/worker/documents/:id`                                      | worker    |
| POST        | `/api/v1/worker/documents/:id/default`                              | worker    |
| GET / PATCH | `/api/v1/employer/company`                                          | employer  |
| GET / POST  | `/api/v1/employer/company/documents`                                | employer  |
| DELETE      | `/api/v1/employer/company/documents/:id`                            | employer  |
| GET         | `/api/v1/admin/verifications?status=pending`                        | admin     |
| POST        | `/api/v1/admin/verifications/company/:id`                           | admin     |
| GET         | `/files/...` (signed links from the API)                            | –         |
| GET         | `/api/v1/auth/dev-users`                                            | dev only  |
| POST        | `/api/v1/auth/dev-login` `{ email }` or `{ phone }` or `{ userId }` | dev only  |

Dev login is temporary (until the real login method is chosen) and is **not available in production**.

Demo logins: `admin@industrialink.demo`, `hr@konark.demo`, `hr@westcoast.demo`, worker phone `9876543210`.

## Testing

**1. Automatic tests** (do this before every commit)

```bash
npm run db:up      # database must be running
npm test           # about 110 tests, uses the separate test database
```

**2. Try the API by hand in VS Code**

1. Install the **REST Client** extension (VS Code suggests it when you open this folder).
2. `npm run db:seed` for fresh demo data, then `npm run dev`.
3. Open a file in [`requests/`](requests) and click **Send Request** above a request.
   Run the "Log in" request at the top of each file first; the others reuse its token.

| File              | What it tries                                               |
| ----------------- | ----------------------------------------------------------- |
| `1-auth.http`     | health, test login, test sign-up, logout, settings          |
| `2-worker.http`   | profile, photo, documents, job search, save, companies      |
| `3-employer.http` | company, proof documents, post / edit / close / delete jobs |
| `4-admin.http`    | approve / reject companies, remove jobs, block users        |
| `5-public.http`   | job search and job page without login                       |

Postman or Bruno work too: same URLs, add `Authorization: Bearer <token>` from the login reply.

**3. Look inside the database:** `npm run db:studio` opens it in the browser.

**4. Start again with clean demo data:** `npm run db:seed` (only works on a database on this computer).

## Files

Uploads (PDF, JPG, PNG, WEBP, max 5 MB) are checked by their real content and saved in `UPLOAD_DIR`
for now. The API returns links that expire. Moving to a storage service later only changes
`src/modules/files/storage.ts`.
