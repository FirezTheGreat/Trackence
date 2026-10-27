# Trackence: Codebase Summary (input for the SRS)

Everything here comes from the source as of v1.1.3 (`client/` and `server/`). Statements marked **(inferred)** are deductions, not things the code states directly. Versions are the ranges declared in each `package.json`.

---

## 1. Tech stack

### Frontend (`client/`)
| Concern | Library | Version |
|---|---|---|
| UI | React, React DOM | ^19.2.4 |
| Language | TypeScript | ^6.0.3 |
| Build / dev server | Vite (+ `@vitejs/plugin-react`) | ^8.0.2 |
| Styling | Tailwind CSS via `@tailwindcss/vite` | ^4.2.2 |
| Routing | react-router-dom | ^7.13.2 |
| State | Zustand | ^5.0.12 |
| Charts | Recharts | ^3.8.0 |
| Animation | Framer Motion; Lenis smooth scroll | ^12.38.0; ^1.3.20 |
| Realtime | socket.io-client | ^4.8.3 |
| QR decoding | jsQR (camera frames via `getUserMedia`) | ^1.4.0 |
| Spreadsheet export | ExcelJS | ^4.4.0 |
| SEO / head | @unhead/react | ^2.1.12 |
| Hosting telemetry | @vercel/analytics, @vercel/speed-insights | ^2.0.x |
| Icons | lucide-react, react-icons | — |

HTTP calls use a `fetch` wrapper (`src/services/api.ts`) with `credentials: "include"`, not Axios. The README's "Axios" entry is out of date.

### Backend (`server/`)
| Concern | Library | Version |
|---|---|---|
| Runtime | Node.js | `>=22 <26` (CI uses 24.13.0) |
| HTTP | Express | ^5.2.1 |
| Database | MongoDB via Mongoose | ^9.3.2 |
| Cache / ephemeral state | Redis via node-redis | ^5.11.0 |
| Realtime | Socket.IO | ^4.8.3 |
| Auth tokens | jsonwebtoken | ^9.0.3 |
| Email | Resend SDK (+ `mock` provider) | ^6.9.4 |
| Webhook verification | svix | ^1.89.0 |
| Security / perf middleware | helmet, cors, compression, cookie-parser, express-rate-limit | ^8.1, ^2.8, ^1.8, ^1.4, ^8.3 |
| QR generation | qrcode | ^1.5.4 |
| IDs | nanoid | ^5.1.7 |
| Reports | ExcelJS | ^4.4.0 |
| Logging | winston | ^3.19.0 |
| Dev tooling | tsx, vitest, @faker-js/faker (demo seed only) | ^4.21, ^4.1, ^10.6 |

---

## 2. Architecture overview

```
 Browser (React SPA on Vercel)
   │  HTTPS fetch, cookies (token, refreshToken, isLoggedIn)
   │  WebSocket (Socket.IO, JWT in handshake or cookie)
   ▼
 Express 5 API  ── single Node process (server/src/index.ts)
   ├─ REST routes /api/*  (auth, admin, attendance, organizations, dashboard, system)
   ├─ Socket.IO server (rooms: session:<id>, org-admins:<orgId>, user:<id>, org:<id>)
   ├─ QR scheduler: per-session setTimeout rotation + 30 s expiry sweep
   └─ Email worker: polls the EmailNotification queue every 5 s
   │                         │                         │
   ▼                         ▼                         ▼
 MongoDB Atlas          Redis (Upstash in prod)     Resend (email API + webhooks)
 durable records        QR tokens, locks, OTP,
                        caches, rate counters
```

- **Frontend.** A single-page app with lazy-loaded routes (`App.tsx`), and Zustand stores for auth, dashboard, modal and toast state. Route guards are in `ProtectedRoute` (`requireAdmin`, `requirePlatformOwner`). The Vite dev server proxies `/api` to `VITE_BACKEND_URL`.
- **API.** Controllers hold most of the business logic, with thin services underneath: QR, session, absence, audit, cache, OTP, email/queue, export, scheduler. Every request gets an `x-request-id` (`request.middleware.ts`), and response times are tracked for the System Health page.
- **MongoDB.** Holds all durable state (section 3). The connection uses `autoIndex: false`. Instead, `ensureIndexes()` (`config/mongoose.ts`) runs right after connecting and creates any missing schema index with `Model.createIndexes()`, which never drops anything. A failure is logged as `HEALTH_ALERT` and does not stop startup. `npm run db:indexes` does the same on demand.
- **Redis.** Holds short-lived state (QR tokens, replay markers, attendance locks, OTP state, signup payloads), 5-minute dashboard caches, and email rate-limit counters. OTP and signup calls go through `redis-fallback.service.ts`, which falls back to an in-process `Map` if Redis errors.
- **Socket.IO.** Pushes QR rotations, live attendance, session lifecycle and membership changes. Socket handshakes are authenticated with the same JWT. Rooms are granted from the database when the socket connects, not from the JWT role:
  - `session:<id>`: admins of that session's org, or members of that org while the session is active. Anyone else is disconnected.
  - `org-admins:<orgId>`: one per org the user administers. Session lifecycle and join-request events go only to the org they concern.
  - `user:<id>` and `org:<id>`: the user's own updates and the orgs they belong to.

  Because rooms are assigned at connect time, a role change takes effect on the next connection (page reload).
- **Email.** Report and notification emails are queued in the `emailnotifications` collection, with retries, exponential backoff, dedupe keys and daily/hourly caps. A worker inside the API process sends them through Resend. OTP emails bypass the queue and send immediately (`sendMailNow`). The Resend webhook (`/api/system/webhooks/resend`, svix-verified) records bounces and complaints in `suppressedemails`, and suppressed addresses are filtered out before sending.

---

## 3. Data model

All cross-collection references are **string business IDs**, not ObjectId refs. ID formats come from `utils/id.utils.ts` (`USR-`, `ORG-`, `SES-`, `ATT-`, `AUD-` + 8 chars from `A–Z2–9`, excluding I/O/0/1). All schemas use Mongoose `timestamps` (`createdAt`, `updatedAt`).

| Collection | Key fields | Constraints declared in schema |
|---|---|---|
| **users** | `userId`, `name`, `email`, `organizationIds[]`, `currentOrganizationId`, `requestedOrganizationIds[]`, `blockedPublicJoinOrgIds[]`, `userOrgRoles[{organizationId, role: member\|admin}]`, `platformRole: user\|platform_owner`, `notificationDefaults{recipients[], includeSelf, sendSessionEndEmail, sendAbsenceEmail, attachReport}` | `userId` unique; `email` unique, lowercased, trimmed; name required |
| **organizations** | `organizationId`, `name`, `code` (uppercased join code), `description`, `owner`, `createdBy`, `isActive`, `isDemo` (set only by the demo seed), `members[{userId, name, email, role, isOrgAdmin}]` (denormalized), `notificationDefaults` | `organizationId` unique. `code` is **not** unique in the schema. The controller validates it as `^[A-Za-z0-9-]{2,20}$`. |
| **sessions** | `sessionId`, `organizationId`, `createdBy`, `startTime`, `endTime`, `duration` (min), `refreshInterval` (s, default 10), `memberCountAtStart`, `isActive`, `notification{recipients[], includeCreator, sendSessionEndEmail, sendAbsenceEmail, attachReport, inheritedDefaultRecipients[]}` | `sessionId` unique. There is no title/subject field. |
| **attendances** | `attendanceId`, `sessionId`, `userId`, `markedAt` | `attendanceId` unique; **compound unique `(sessionId, userId)`** |
| **absences** | `sessionId`, `memberId`, `memberName`, `memberEmail` (snapshots), `reason` ∈ {Late Submission, Medical, Leave, Other, Not Provided}, `isExcused`, `excusedAt`, `excusedBy`, `markedManually`, `markedAt` | compound unique `(sessionId, memberId)` |
| **auditlogs** | `auditId`, `action`, `performedBy` (userId or `"system"`), `performedByName/Email`, `targetId`, `targetResourceType` ∈ {session, user, organization, absence, admin_request, unknown}, `organizationId`, `metadata` (mixed), `details{…}`, `ipAddress`, `userAgent`, `timestamp` | `auditId` unique |
| **emailnotifications** | `notificationId` (`NTF-…`), `eventType`, `fromCategory`, `organizationId`, `sessionId`, `dedupeKey`, `recipients[]`, `subject`, `html`, `text`, `attachments[]` (base64), `status` ∈ {queued, processing, sent, failed, dead}, `attempts`, `maxAttempts` (5), `nextAttemptAt`, `sentAt`, `lastError` | `notificationId` unique; `dedupeKey` unique, partial index over string values only (most rows store `null`) |
| **organizationjoinrequests** | `userId`, `organizationId`, `status` ∈ {pending, approved, rejected, cancelled}, `requestedAt`, `processedAt`, `processedBy`, `requestSource` ∈ {direct, invite}, `inviteToken`, `decisionNote` (≤1000) | compound unique `(userId, organizationId)` |
| **organizationinvites** | `token` (nanoid 32), `organizationId`, `createdBy`, `invitedEmail` / `invitedUserId` (personal invite) or neither (public link), `expiresAt` (1–30 days), `revokedAt/By`, `rejectedAt/By`, `useCount` | `token` unique |
| **suppressedemails** | `email`, `reason`, `source`, `active`, `lastEventAt`, `metadata` | `email` unique |

These constraints are real database indexes: they exist in production (applied 2026-10-27) and are ensured on every API start. The database itself therefore rejects duplicate emails, duplicate attendance per user per session, duplicate absences, and so on.

### Entity relationships
```
User ──< userOrgRoles / organizationIds >── Organization      (many-to-many; role per org)
User ──< OrganizationJoinRequest >── Organization              (one request per user+org)
Organization ──< OrganizationInvite                             (public link or personal)
Organization ──< Session  (createdBy → User, an org admin)
Session ──< Attendance >── User                                 (at most one per user+session)
Session ──< Absence    >── User                                 (generated at session end)
Session ──< EmailNotification                                   (session_ended / absence_detected)
AuditLog → (performedBy User, targetId, organizationId)
```
- Membership is stored on **both** sides: `User.organizationIds`/`userOrgRoles` is the source of truth (comment in `auth.controller.ts`), and `Organization.members` is rebuilt from it by `syncOrgMembers()`.
- There is **no Course, Class or Section entity.** An organization is the grouping unit (a class, department or club). A student in several classes belongs to several organizations, and `currentOrganizationId` selects the active context in the UI.

---

## 4. API endpoints (all under `/api`)

Guards: **auth** = valid `token` cookie (`authenticate`). **org-admin** = admin in the target org (`requireTargetOrgAdmin`). **active-org-admin** = admin of the org the request targets (`?orgId=`, else the current org), via `requireAdminOfActiveOrg`; being admin of a different org is not enough. **any-admin** = admin in at least one org (`requireOrgAdmin`); used only for `/admin/admins`, whose results are scoped to the caller's admin orgs. **PO** = `platformRole: platform_owner`.

### Auth and profile (`/auth`)
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | rate-limited | Start signup (name, email, optional invite token); stores the payload in Redis for 10 min and emails an OTP |
| POST | `/auth/login` | rate-limited | Email an OTP to an existing user |
| POST | `/auth/verify-otp` | rate-limited | Verify the OTP; creates the user on first signup; sets cookies |
| POST | `/auth/resend-otp` | rate-limited | Resend OTP |
| GET | `/auth/otp-delivery-status` | 30/min | Whether an address is suppressed |
| POST | `/auth/recovery/email` | rate-limited | Request support help for an undeliverable inbox |
| POST | `/auth/refresh` | rate-limited | Rotate the access token from `refreshToken` |
| POST | `/auth/logout` | — | Clear cookies |
| GET | `/auth/me` | auth | Current user |
| PATCH | `/auth/me/name` | auth | Rename self |
| GET/PATCH | `/auth/me/notification-defaults` | auth | Personal email defaults |
| PATCH | `/auth/current-organization` | auth | Switch active org |
| GET | `/auth/organizations` | **public** | List active orgs (join page, org switcher). Demo orgs are included only for a signed-in member of them. |
| GET | `/auth/organizations/:orgId/members` | auth + member of that org (or PO) | Member list for viewers |
| GET | `/auth/pending-organizations` | auth | My pending join requests |
| POST | `/auth/request-organization` | auth | Request to join an org |
| POST | `/auth/cancel-organization-request` | auth | Cancel a pending request |
| GET | `/auth/org-invites/:token` | public | Invite details |
| POST | `/auth/org-invites/:token/{request,accept,reject}` | auth | Act on an invite |

### Organizations (`/admin/organizations`)
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/` | auth | Create an org (any signed-in user; becomes owner and admin) |
| GET | `/` | PO | List organizations |
| GET | `/:orgId` | member | Org details |
| PUT | `/:orgId` | member; controller requires `owner` or `createdBy` | Update org |
| DELETE | `/:orgId` | member; controller requires `owner` | Delete org |
| GET/PATCH | `/:orgId/notification-defaults` | org-admin | Org email defaults |
| GET | `/:orgId/members` | member | Members |
| POST / DELETE | `/:orgId/members[/:userId]` | org-admin | Add / remove a member |
| PATCH | `/:orgId/members/:userId/{promote,demote}` | org-admin | Change role |
| GET | `/:orgId/join-requests` | org-admin | Pending requests |
| PATCH | `/:orgId/join-requests/:userId/{approve,reject}` | org-admin | Decide a request |
| GET / POST | `/:orgId/invites` | org-admin | List / create invites |
| PATCH | `/:orgId/invites/:token/revoke` | org-admin | Revoke an invite |
| POST | `/:orgId/leave` | member | Leave org |
| PATCH | `/:orgId/transfer-owner` | member; controller requires `owner`, and the new owner must be a member | Transfer ownership |

### Sessions (admin) (`/admin`, guard: active-org-admin or PO; the session must also belong to that org)
| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/session/create` | Create a QR session (`duration` ≤ `MAX_SESSION_DURATION_MINUTES`, default 120) |
| GET | `/admin/sessions` | Active sessions in the current org |
| GET | `/admin/sessions/all?page&limit&filter&search` | All sessions (paginated) |
| GET | `/admin/session/:id` | Session + live counts |
| GET | `/admin/session/:id/qr` | Current QR image (cached per rotation) |
| GET | `/admin/session/:id/attendance` | Attendees (paginated) + 5 most recent |
| GET | `/admin/session/:id/export` | XLSX export |
| PATCH | `/admin/session/:id` | Update duration / refreshInterval (5–60 s) |
| POST | `/admin/session/:id/end` | End now (absence detection + emails) |
| DELETE | `/admin/session/:id` | Permanently delete the session, its attendance and absences |
| GET | `/admin/notifications/history` | Email history for the org (filters: eventType, status, search, date range) |

### Attendance (member) (`/attendance`, guard: auth)
| Method | Path | Purpose |
|---|---|---|
| POST | `/attendance/mark` | Mark attendance from a scanned QR (10/min per user) |
| GET | `/attendance/active-session` | Latest active session in my current org |
| GET | `/attendance/my-history` | My attended / absent / excused history |
| GET | `/attendance/my-stats` | My totals and rate |

### Absences (`/admin/absences`, guard: role `admin` in current org, or PO)
`POST /detect/:sessionId`, `GET /session/:sessionId`, `GET /pending`, `GET /summary/:sessionId`, `GET /stats/:sessionId`, `PUT /:absenceId/excuse`, `POST /:absenceId/mark-attended`, `POST /bulk-excuse`.

### Dashboards (`/admin/dashboard`, guard: auth + org context; `?orgId=` must be one of the user's orgs unless PO)
`GET /metrics` (cached 5 min), `GET /stats`, `GET /health`, `GET /enhanced` (cached 5 min), `GET /platform/overview` (PO, cached 5 min).

### Platform admin and system
| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/admin/audit-logs` | PO (+ admin in current org) | Audit trail for the current org (filters: action, userId, from, to) |
| GET | `/admin/admins` | any-admin | Admins list |
| PATCH | `/admin/users/:userId/name` | PO | Rename any user |
| GET | `/admin/platform/overview` | PO | Same as the dashboard platform overview |
| GET | `/system/health` | public | Mongo/Redis status, uptime |
| GET | `/system/metrics` | PO | Process/system metrics, API response-time stats |
| POST | `/system/lead-inquiries` | 6/min | Public contact form; emails `LEADS_NOTIFICATION_EMAIL` |
| POST | `/system/webhooks/resend` | svix signature | Delivery events → `suppressedemails` |

---

## 5. Roles and permissions

| Role | Scope | Can |
|---|---|---|
| **Member** | per organization (`userOrgRoles.role = member`) | Join or request orgs, switch current org, scan QR / mark attendance in the current org, view own history and stats, view org members, leave org |
| **Org admin** | per organization (`role = admin`) | Everything a member can, plus: create, end, edit, delete and export sessions; view live attendance; manage absences (excuse, bulk excuse, manual mark); approve/reject join requests; invites; add/remove/promote/demote members; org notification defaults; org dashboards. The creator of a session is auto-marked present. |
| **Org owner** | `Organization.owner` | Admin, plus update (owner or creator), delete and transfer ownership (enforced in the controllers) |
| **Platform owner** | global (`platformRole = platform_owner`) | Cross-org dashboards (`?orgId=` for any org), Platform Insights (masks orgs below a 5-member privacy threshold), Audit Logs, System Health, list all orgs, rename users |

- The effective role is recomputed **on every request** from the database, using the user's current org (`authenticate`). Promotions and demotions take effect immediately, without a new token.
- The client hides routes with `ProtectedRoute`, but the server is the enforcing layer.
- Any signed-in user can create an organization (`orgSelfCreateGuard = [authenticate]`).

---

## 6. QR rotation and scan flow (step by step)

1. **Create.** An admin calls `POST /admin/session/create` with `{duration, refreshInterval?, notification?}`. The server:
   - snapshots `memberCountAtStart` (the org's member count)
   - saves a `Session` with `isActive: true`
   - generates a 21-char nanoid token and stores it in Redis
   - auto-marks the creator present (an upsert on `(sessionId, userId)`) if this is their current org and they're an admin there
   - writes audit logs, and emits `session:started` (to the room) and `session:created` (to that org's admins)
2. **Rotate.** `startSessionRotation` schedules a per-session `setTimeout` loop, held in process memory. Every `refreshInterval` seconds it:
   - generates a new token
   - `SET qr:current:<sid> <token> EX interval+5` and `SET qr:valid:<sid>:<token> 1 EX interval+5` (a 5-second grace window, so the previous code still validates briefly)
   - builds the QR image from the JSON `{sessionId, qrToken, issuedAt, expiresAt}`, caches it at `qr:image:<sid>` (TTL interval+5), and emits `qr:rotated` to `session:<sid>`

   The admin's fullscreen QR view (`/sessions/scan/:sessionId`) updates live from the socket. `GET …/qr` returns the cached image, so every viewer sees the same code.
3. **Scan.** On a phone, the student's `/scan-qr` page decodes camera frames with jsQR and parses the JSON payload. If the text isn't JSON, it's treated as a manually typed code.
   - **Manual fallback (intentional):** a member may enter the session code instead of scanning. If `qrToken` equals the session ID (with or without `SES-`), the token and replay checks in step 4 are skipped. Membership, current-org, duplicate and lock checks still apply. This is a deliberate design choice for when a camera can't be used; it means the session code alone is enough for any member of that org.
4. **Mark.** `POST /attendance/mark {sessionId, qrToken, expiresAt}` runs these checks in order (rate limit 10/min/user):
   1. If the client-sent `expiresAt` has passed → 401.
   2. The session exists and `isActive` → otherwise 404.
   3. The user is a member of the session's org **and** it's their current org → otherwise 403.
   4. `EXISTS qr:valid:<sid>:<token>` (legacy fallback: `qr:current`) → otherwise 401.
   5. Replay check: `EXISTS qr:used:<sid>:<uid>:<token>` → 401 if found.
   6. No existing Attendance for `(sessionId, userId)` → otherwise 409.
   7. **Lock:** `SET attendance:lock:<sid>:<uid> locked NX EX 3600`. If it isn't acquired → 409. This is the race-condition guard against double submits.
   8. `SET qr:used:<sid>:<uid>:<token> EX 30`.
   9. Insert `Attendance`, emit `attendance:update` to the session room (live list on the admin screen), and write an `attendance_marked` audit log.
5. **Expire.** Every 30 s the scheduler finds `isActive: true AND endTime <= now`. For each session it:
   - stops rotation and emits `session:ended`
   - sets `isActive: false` and deletes `qr:<sid>`
   - runs **absence detection**: an `Absence` upsert for every current org member without an Attendance
   - builds XLSX attendance and absence reports (if `attachReport`)
   - queues the `session_ended` and `absence_detected` emails to the configured recipients plus the creator

   `POST …/end` does the same immediately. The remaining `qr:current`/`qr:valid`/`qr:image` keys aren't deleted; they expire within seconds.
6. **After the session.** Admins can excuse absences (with a reason), bulk-excuse, or "mark attended" (which creates the Attendance and flags the absence `markedManually`, `isExcused`).

**What persists where.**
- **MongoDB:** Session, Attendance, Absence, AuditLog, EmailNotification.
- **Redis only:** tokens, used markers, locks, the QR image cache, OTP state, signup payloads, dashboard caches, email rate counters.
- **Process memory only:** rotation timers. These are re-created from active sessions at startup (`startQRScheduler`).

---

## 7. Auth flow

1. **Signup.** `POST /auth/signup {name, email, inviteToken?}`. Duplicate emails are rejected. The payload is stored in Redis as `signup:data:<email>` (10 min), and an OTP is emailed.
2. **Login.** `POST /auth/login {email}`. The user must exist; an OTP is emailed.
3. **OTP.** A 6-char code from an unambiguous alphabet. It is stored only as `sha256(otp + OTP_PEPPER)` at `auth:otp:<email>`.
   - The code expires after 5 min.
   - A user gets 3 wrong attempts; after that a 5-min cooldown applies.
   - At most 8 OTP requests per 10 min. Comparison uses `crypto.timingSafeEqual`.
4. **Verify.** `POST /auth/verify-otp`. On first signup this creates the User (and a pending join request if an invite was used). It normalizes `currentOrganizationId`, then sets the cookies:
   - `token`: JWT `{userId, role, platformRole}`, 1 day, httpOnly
   - `refreshToken`: 7 days, httpOnly, signed with `JWT_REFRESH_SECRET` or `JWT_SECRET`
   - `isLoggedIn`: a non-httpOnly flag the SPA can read

   In production the cookies are `Secure`, `SameSite=None`, domain `.trackence.app`.
5. **Requests.** `authenticate` verifies the JWT, then reloads the user from MongoDB to compute the effective role. The JWT `role` is informational only.
6. **Refresh.** On a 401 from an authenticated call, the client wrapper (`api.ts`) calls `POST /auth/refresh` once, de-duplicating concurrent refreshes, and retries the request.
7. **Logout.** Clears the cookies across domain variants.

Users never have passwords.

---

## 8. Non-functional aspects visible in code

- **Rate limiting** (express-rate-limit, per 1-minute window):
  - auth endpoints: 5/IP
  - OTP status: 30/IP
  - attendance mark: 10/user
  - lead form: 6/IP
  - OTP: request and attempt caps (section 7)
  - email: global, per-org, per-actor and per-recipient daily/hourly caps, configurable via `EMAIL_*_CAP` env vars
- **Atomic and idempotent operations:**
  - `SET NX EX` attendance lock
  - replay markers
  - creator auto-mark via `updateOne … $setOnInsert, upsert`
  - absence detection via `findOneAndUpdate … $setOnInsert, upsert`
  - email worker claims jobs with `findOneAndUpdate(status → processing)`
  - email `dedupeKey` (`<eventType>:<sessionId>`) prevents duplicate session emails
  - "Read-only normalization" on login avoids write-on-read races (comment in `auth.controller.ts`)
  - database unique indexes are the final backstop behind these checks (section 3)
- **Expiry and TTLs:**

  | Item | Lifetime |
  |---|---|
  | QR token | refreshInterval + 5 s (UI shows refreshInterval) |
  | Used marker | 30 s |
  | Attendance lock | 1 h |
  | OTP | 5 min |
  | Signup payload | 10 min |
  | Access JWT | 1 d |
  | Refresh JWT | 7 d |
  | Invites | 1–30 d |
  | Dashboard caches | 5 min |
- **Email reliability:**
  - 5 attempts with exponential backoff (20 s base, capped at 30 min), then `dead`
  - permanent-error detection
  - suppression list fed by Resend webhooks
- **Error handling:** controllers catch errors and return JSON `{message}`. A global 404 and 500 handler includes `requestId`. Cache failures never break requests. OTP and signup state falls back to in-memory storage if Redis fails.
- **Security headers and transport:**
  - helmet
  - CORS allow-list from `FRONTEND_URL` (plus www/apex variants)
  - HTTPS redirect and `trust proxy` in production
  - httpOnly cookies
  - org-scoping checks on every session and absence endpoint (`canAccessSessionInCurrentOrg`, `ensureAbsenceInActiveOrg`) and on org member lists
- **Observability:**
  - winston logs (JSON plus `logs/*.log` files in production)
  - per-request IDs and a response-time tracker (shown on System Health)
  - `HEALTH_ALERT` log lines on Mongo/Redis disconnects
  - `/system/health` endpoint
  - `npm run smoke` script
- **Performance:**
  - gzip compression
  - Vite manual vendor chunks (react, charts, motion, excel, socket)
  - lazy routes
  - an iOS/low-power "perf mode" that reduces effects (`utils/device.ts`)

---

## 9. Deployment and environments

| Part | Where | Evidence |
|---|---|---|
| Frontend | Vercel, `https://trackence.app` | `client/vercel.json` (SPA rewrite), `@vercel/analytics`, `client/.env.production` |
| API | `https://api.trackence.app` on Railway **(inferred)** | `VITE_BACKEND_URL`, comment "Railway runs behind a proxy" in `server/src/index.ts` |
| Database | MongoDB Atlas cluster `trackence-app-prod` / db `trackence_prod` | `server/.env.production` |
| Redis | Upstash (TLS `rediss://`) | `server/.env.production`, Upstash handling in `config/redis.ts` |
| Email | Resend | `EMAIL_PROVIDER=resend`, `RESEND_*` env vars |
| CI | GitHub Actions "Build Gate": `npm ci` + build for client and server on PRs and pushes to `main` | `.github/workflows/build-gate.yml` |
| Local dev database | MongoDB 7.0 in Docker (`trackence-mongo`, bound to 127.0.0.1:27017, db `trackence_dev`, persistent volume) | `docker-compose.yml`, `server/.env.development` |
| Local dev Redis | Locally installed Redis on 127.0.0.1:6379 (not in compose) | `server/.env.development` |

- **Environment selection.** `NODE_ENV=production` loads `server/.env.production`; anything else loads `.env.development`.
- **Required env vars:** `MONGODB_URI`, `JWT_SECRET`, `REDIS_URL`, plus `FRONTEND_URL` in production and `RESEND_API_KEY` with a sender address when the provider is Resend.
- **Development uses a local Docker MongoDB** (`docker compose up -d`), separate from production. There is no hosted staging environment.
- **Single-instance assumption (inferred).** QR rotation timers and the email worker run inside the API process. With more than one replica, rotations would be duplicated per instance. The expiry sweep is mostly idempotent. Socket.IO has no adapter configured, so rooms aren't shared across instances.

---

## 10. Observations relevant to the SRS (constraints and known gaps)

1. **Manual-code fallback is a design trade-off.** Entering the session code is deliberately allowed instead of scanning (section 6, step 3). The rotating QR therefore prevents replay of *scanned* codes, but not attendance by a member who has been told the session code. State this explicitly in the SRS.
2. **The dashboard "Attendance trend" counts sessions per day**, not attendance (`getAttendanceTrend`).
3. **Time-of-day widgets are UTC and today-only.**
   - The session distribution groups by MongoDB `$hour` (UTC). The client renders only hours 6–22 UTC, so morning IST sessions (before 11:30 IST) are not drawn.
   - Peak hour uses server-local time.
   - Both consider only today's sessions.
4. **"Top departments" is always "Unassigned".** It looks up `user.department`, which isn't in the User schema. `getAbsenceStatsByDepartment` and the `department` filter on pending absences are similarly no-ops.
5. **Cache invalidation is likely broken (inferred).** `cacheService.invalidatePattern` calls `redis.scan(cursor, "MATCH", pattern)` with ioredis-style arguments, but the client is node-redis v5. Errors are caught and logged, so pattern invalidation probably never deletes anything; caches just expire after 5 minutes.
6. **The public org directory is unauthenticated.** `GET /api/auth/organizations` returns every active, non-demo organization's name, code, description, member count and owner ID to unauthenticated callers. Member names and emails are not public: the member-list endpoint is restricted to members of that org and the platform owner.
7. **Tenant isolation is per organization.** Admin rights apply only to the org a user administers. Admin REST routes check the targeted org (`requireAdminOfActiveOrg`), and live events and session rooms are scoped by org (section 2). Members (non-admins) can still read their own org's aggregate dashboard metrics through `/admin/dashboard/*`, which only checks membership; the UI shows Analytics to admins only.
8. **`EMAIL_PROVIDER=smtp` is accepted by env validation but not implemented.** Delivery falls through to Resend.
9. **Retention.** There's no automatic cleanup of absences, audit logs or email history. A manual 90-day cleanup existed but was unreachable, and was removed as dead code.

---

## 11. Demo dataset (for the walkthrough)

`npm run seed:demo` / `unseed:demo` (see README "Demo data") create and remove a tagged demo semester:

- 4 demo organizations (DSA, DBMS, Probability & Statistics, Web Tech Lab)
- ~110 fictional students
- ~76 sessions over 9 weeks, with attendance, absences, join requests, invites, email history and audit logs

Every document has `isDemo: true` and is written through the Mongoose schemas (validation and defaults applied). Demo organizations appear only to their members (the owner account, plus an optional linked student account); everyone else's directory and member lists exclude them.
