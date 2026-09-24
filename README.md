# Permit to Work (PTW) Module

A Permit to Work module for a CMMS. Manages hazardous-work permits from request to closure, with server-enforced approvals, role-based access and an audit trail.

**Status:** work in progress. Project setup is done. Features are being built.

## Tech stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL (Neon) with Prisma

## Run locally

```
git clone https://github.com/Aarushi84/ptw-module.git
cd ptw-module/server
npm install
```

Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `JWT_SECRET`, then:

```
npm run dev
```

The API runs on `http://localhost:3000`. Check `/health`.

For the client, in a second terminal:

```
cd client
npm install
npm run dev
```