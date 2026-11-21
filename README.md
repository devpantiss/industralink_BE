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

Rules: routes only wire URLs; controllers read the request and reply; services hold the logic and
database calls; mappers decide which fields leave the API.

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

## Files

Uploads (PDF, JPG, PNG, WEBP, max 5 MB) are checked by their real content and saved in `UPLOAD_DIR`
for now. The API returns links that expire. Moving to a storage service later only changes
`src/modules/files/storage.ts`.
