# Trackence

Trackence is a full-stack attendance management platform with real-time QR-based check-ins, role-based access, secure session handling, and analytics dashboards for institutions and organizations.

## Features

- Real-time QR attendance marking
- Role-based flows for admin and member
- Session lifecycle management (create, monitor, expire)
- Attendance and absence reporting
- Organization-aware user management
- Live updates with Socket.IO
- Modern responsive frontend with Framer Motion and Tailwind CSS

## Tech Stack

### Frontend (client)

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Zustand
- Axios
- Socket.IO Client

### Backend (server)

- Node.js + TypeScript
- Express 5
- MongoDB (Mongoose)
- Redis
- Socket.IO
- JWT auth
- Winston logging

## Repository Structure

```text
Trackence/
  client/   # React + Vite frontend
  server/   # Express + MongoDB + Redis backend
```

## Prerequisites

- Node.js 24.13.0 LTS (recommended)
- npm 10+
- MongoDB: for local development, Docker (see `docker-compose.yml`)
- Redis running locally or remotely

## Setup

### 1) Clone and install dependencies

```bash
git clone <your-repo-url>
cd Trackence

cd client
npm install

cd ../server
npm install
```

### 2) Configure environment variables

Copy and edit example env files in both apps:

- `client/.env.example`
- `server/.env.example`

For SEO and canonical URLs, ensure `client` has `VITE_SITE_URL` set to your live frontend domain.

Recommended:

- Keep secrets only in local `.env.*` files
- Do not commit production secrets

### 3) Start the local database

`server/.env.development` points at a local MongoDB (`mongodb://127.0.0.1:27017/trackence_dev`). Start it from the repo root:

```bash
docker compose up -d
```

Data persists in the `trackence-mongo-data` Docker volume; `docker compose down -v` wipes it. On a fresh database, run `npm run seed` in `server/` to create the platform-owner account. Optionally run `npm run seed:demo -- --owner=<that email>` for realistic data. The API creates any missing MongoDB indexes on startup.

### 4) Run development servers

Terminal 1 (backend):

```bash
cd server
npm run dev
```

Terminal 2 (frontend):

```bash
cd client
npm run dev
```

## Build for Production

Frontend:

```bash
cd client
npm run build
npm run preview
```

Backend:

```bash
cd server
npm run build
npm start
```

## Useful Scripts

### Client

- `npm run dev` - start Vite dev server
- `npm run build` - type-check and build
- `npm run lint` - run ESLint
- `npm run preview` - preview production build

### Server

- `npm run dev` - start backend with watch mode
- `npm run build` - compile TypeScript
- `npm start` - run compiled backend
- `npm run seed` - seed initial data
- `npm run seed:demo` / `npm run unseed:demo` - add / remove the labelled demo dataset (see below)
- `npm run db:indexes` - create any missing schema indexes now, without restarting the API (`-- --dry-run` to only report; `-- --env=production --i-know-this-is-prod` for prod)
- `npm run smoke` - run basic API smoke checks against `API_BASE_URL` (defaults to `http://localhost:5000`)
- `npm test` - run tests

## Demo data

`seed:demo` creates a realistic, clearly-labelled demo semester linked to an existing account, for walkthroughs. It adds:

- 4 classes, each its own organization named `… (Demo)` with code `DEMO-*`
- ~110 fictional students (Indian names, `@example.com` emails)
- 9 weeks of IST-timetabled sessions with attendance, absences, excuses, join requests, invites, email history and audit logs

Every document is tagged `isDemo: true`. Demo classes are hidden from the public organization directory, and their member lists are visible only to members, so other users never see them. `unseed:demo` removes exactly the demo data, plus anything created inside the demo classes during a walkthrough. Real users stay; their links to demo classes are removed and their selected organization is restored.

Run from `server/`:

```bash
# Local / dev database (uses .env.development, or MONGODB_URI from your shell)
npm run seed:demo -- --owner=you@example.com
npm run unseed:demo

# Production (prints the target and refuses without the explicit flag)
npm run seed:demo -- --env=production --i-know-this-is-prod --owner=you@example.com \
  --student=second-account@example.com --student-name="Your Name"
npm run unseed:demo -- --env=production --i-know-this-is-prod
```

Options:

- `--owner` (or `DEMO_OWNER_EMAIL`): an existing account. It becomes owner/admin of the demo classes and opens on the DSA class. Its name, email, role and auth data are not changed.
- `--student` / `--student-name` (or `DEMO_STUDENT_EMAIL` / `DEMO_STUDENT_NAME`): an optional second account, added as a DSA student with attendance history, so you can scan a live QR from a phone. If it doesn't exist it is created as a demo user, and `unseed:demo` deletes it again.
- `--anchor=YYYY-MM-DD`: the last day of the generated semester. Defaults to today in IST.
- `--dry-run`: validates everything and shows counts without writing.

Notes:

- **Reruns are idempotent and deterministic.** Each run removes the old demo data first, and a fixed random seed means the same anchor date gives the same dataset.
- **Rerun on demo day.** The "today" widgets (sessions today, time-of-day chart, peak hour) only count sessions that already ended today. Re-run after that day's classes have started.
- **No side effects.** The scripts never send email or Socket.IO events. Sessions are inserted as already ended, and email history is inserted as `sent`/`dead`, so the running server's scheduler and email worker ignore them.

## Notes

- Client and server maintain separate `.gitignore` files.
- Redis authentication is supported through server env configuration.
- If frontend cannot reach backend, verify API base URL and CORS settings.

## License

See `server/package.json` for backend license metadata.
