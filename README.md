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
- MongoDB running locally or remotely
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

### 3) Run development servers

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
- `npm run smoke` - run basic API smoke checks against `API_BASE_URL` (defaults to `http://localhost:5000`)
- `npm test` - run tests

## Notes

- Client and server maintain separate `.gitignore` files.
- Redis authentication is supported through server env configuration.
- If frontend cannot reach backend, verify API base URL and CORS settings.

## License

See `server/package.json` for backend license metadata.
