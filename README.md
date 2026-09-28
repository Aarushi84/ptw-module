# Permit to Work (PTW) Module

A Permit to Work module for a CMMS (Computerized Maintenance Management System). It manages hazardous-work permits from request to closure. Every rule is enforced on the server, so the UI cannot be used to skip a safety step.

**Live demo:** https://ptw-module.vercel.app
**API health check:** https://ptw-module.onrender.com/health

---

## What problem it solves

On an industrial site, jobs like welding, confined-space entry, work at height and electrical isolation need written permission before anyone starts. On paper or in spreadsheets, it is hard to prove who approved what, and when. Permits get approved after the work slot has passed, one person signs for two roles, and two dangerous jobs run in the same area at the same time.

This module makes those mistakes hard to make:

- A permit cannot start until two different people (Area Owner and Safety Officer) approve it.
- Nobody can approve a permit after its work window has ended.
- Every change is written to an audit trail, so there is a full record of who did what, and when.

---

## Features

### Permits
- Four permit types: hot work, confined space, work at height, electrical isolation.
- Each type has its own extra fields. For example, hot work asks for the type of hot work, fire watch name, extinguisher type, cleared radius, and gas test readings (LEL % and O2 %).
- Two-step create form: common details first, then type-specific details.
- Save as draft, or submit for approval.
- Auto-numbered permits (`PTW-0001`, `PTW-0002`, ...).
- Drafts can be edited only by their own requester. Once submitted, a permit is locked.
- Permit list can be filtered by status, type, area, date range, and "waiting for my approval".

### Approval workflow
- Every submitted permit needs two approvals: **Area Owner** and **Safety Officer**.
- One person cannot fill both approval slots.
- Rejecting a permit requires a written reason.
- Approvals are blocked once the permit's planned end time has passed.
- The permit becomes **Approved** only when both approvers have approved. A single rejection sets it to **Rejected**.

### Lifecycle
Draft → Pending approval → Approved → Active → Closed → Verified

Other states: Suspended (and resume back to Active), Rejected, Cancelled, Expired.

| Status | Meaning |
|---|---|
| Draft | Being written by the requester. Not visible to approvers. |
| Pending approval | Submitted. Waiting for both approvers. |
| Approved | Both approvers signed. Work has not started yet. |
| Active | Work is in progress. |
| Suspended | Work paused. Can be resumed. |
| Closed | Work finished. Completion notes recorded. |
| Verified | Closure checked and confirmed. |
| Rejected | An approver rejected it. Reason is on record. |
| Cancelled / Expired | Permit ended without completing normally. |

### Safety checks
- **Conflict warning:** when a hot work permit overlaps in time and area with a confined space permit (or the other way round), the requester sees a warning with the permit number it clashes with. The two jobs should not run together, because open flame and confined-space ventilation do not mix.
- **Type-specific validation:** a permit cannot be submitted until its type-specific fields pass validation.

### Access control
- Role-based access: Requester, Area Owner, Safety Officer, Admin.
- The server checks the user's role on every action.
- The UI only shows buttons the current user is allowed to use. Even if a button were shown by mistake, the server would still refuse the action.

### Audit trail
- Every create, edit, approval, rejection and status change is logged with the person, the time, the old status, the new status and any comment.
- Edits to draft permits are logged field by field, with old and new values.
- The audit trail is shown on each permit's detail page.

### Safe under simultaneous use
- Each permit has a version number. If two people change the same permit at the same moment, the second one gets a clear "changed by someone else, refresh and try again" message instead of silently overwriting.
- Status changes and their audit log entries are saved together in one database transaction. Either both are saved or neither is.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon) with Prisma |
| Auth | JWT bearer tokens |
| Hosting | Vercel (client), Render (server) |

---

## Project structure

```
ptw-module/
├── client/
│   └── src/
│       ├── api.ts                  # fetch wrapper, reads VITE_API_URL
│       ├── types.ts
│       ├── components/
│       │   └── ProtectedRoute.tsx
│       ├── context/
│       │   └── AuthContext.tsx
│       ├── lib/
│       │   └── permitActions.ts    # which buttons a user may see
│       └── pages/
│           ├── Login.tsx
│           ├── Dashboard.tsx
│           ├── CreatePermit.tsx
│           └── PermitDetail.tsx
└── server/
    └── src/
        ├── db.ts
        ├── middleware/
        │   ├── auth.ts             # verifies the JWT
        │   └── requireRole.ts      # role check per route
        ├── routes/
        │   └── permits.ts          # HTTP layer only
        ├── services/
        │   ├── permitService.ts    # transactions, approvals, audit log
        │   └── permitRules.ts      # all state-machine and permission rules
        └── validation/
            └── permitTypes.ts      # per-type field validation
```

Design choice: **all business rules live in one file** (`permitRules.ts`). Routes only handle HTTP, and the service layer only handles database work. This keeps the rules easy to read and easy to test.

---

## Run locally

You need Node.js 18+ and a PostgreSQL database (a free Neon database works).

**1. Clone**

```bash
git clone https://github.com/Aarushi84/ptw-module.git
cd ptw-module
```

**2. Server**

```bash
cd server
npm install
```

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign login tokens |

Then run:

```bash
npm run dev
```

The API starts on `http://localhost:3000`. Open `/health` to check it.

**3. Client** (second terminal)

```bash
cd client
npm install
```

Create `client/.env`:

```
VITE_API_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

**4. Areas and equipment**

Permits need an Area ID and an Equipment ID. In the create form these are pasted in by hand. To find real IDs, open Prisma Studio from the `server` folder:

```bash
npx prisma studio
```

Copy an `id` from the `Area` table and one from the `Equipment` table.

---

## Demo accounts

| Name | Role | Email |
|---|---|---|
| Ravi Kumar | Requester | `requester@ptw.test` |
| Suresh Iyer | Safety Officer | `safety@ptw.test` |
| Priya Nair | Area Owner | `area@ptw.test` |

All demo accounts use the password `password123`. These are test accounts with sample data only.

To see the full approval flow, log in as the Requester and create and submit a permit. Then log in as the Safety Officer and approve it. Then log in as the Area Owner and approve it. The permit only becomes Approved after both.

**Tip:** set the planned end time well in the future. Approvals are blocked after it passes.

---

## API overview

All routes except login and health need an `Authorization: Bearer <token>` header.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Server check |
| POST | `/auth/login` | Log in, get a token |
| POST | `/permits` | Create a draft permit |
| GET | `/permits` | List permits, with filters |
| GET | `/permits/:id` | Permit detail with approvals and audit trail |
| PATCH | `/permits/:id` | Edit a draft |
| POST | `/permits/:id/submit` | Validate and submit for approval |
| POST | `/permits/:id/activate` | Start work |
| POST | `/permits/:id/suspend` | Pause work |
| POST | `/permits/:id/resume` | Resume work |
| POST | `/permits/:id/close` | Close with completion notes |
| POST | `/permits/:id/verify` | Verify the closure |
| POST | `/permits/:id/cancel` | Cancel a permit |
| POST | `/permits/:id/approvals/:approvalId/decide` | Approve or reject one approval |

Errors are returned as JSON with a `message`. Validation errors also include an `issues` list. Status codes: `400` invalid input, `403` not allowed, `404` not found, `409` rule violation or stale version.

---

## Tests and build

```bash
cd server
npm test          # state machine and validation tests
npm run build

cd ../client
npm run build
```

---

## Deployment

- **Client:** Vercel. Set the environment variable `VITE_API_URL` to the server URL (no trailing slash) and redeploy. Vite reads this at build time, so changing it needs a new build.
- **Server:** Render, with `DATABASE_URL` and `JWT_SECRET` set.
- **Database:** Neon PostgreSQL.

If the server has been idle, the first request can take a while to respond.

---

## Known limitations

- Area and equipment are entered by ID. A dropdown fed from the database would be better.
- The approval deadline is tied to the work window (`plannedEnd`). A permit for a short job can become impossible to approve if reviewers are slow. A separate approval deadline would fix this.
- Permit numbers are based on a count of existing permits. Two permits created at the same instant could get the same number. A database sequence would be safer.
- The permit `type` value is not checked against the allowed list before the conflict check. Invalid values fail later, at the database, instead of returning a clean `400`.
- The conflict check between hot work and confined space warns the requester but does not block creation.

---

## Author

Aarushi — [github.com/Aarushi84](https://github.com/Aarushi84)
