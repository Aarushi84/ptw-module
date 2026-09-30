# Permit to Work (PTW) Module

A Permit to Work module for a CMMS. It manages hazardous-work permits from request to closure: hot work, confined space entry, work at height, and electrical isolation (LOTO). Every rule is enforced on the server, so the UI cannot be used to skip a safety step.

- **Live demo:** https://ptw-module.vercel.app
- **API health check:** https://ptw-module.onrender.com/health

Note: the API runs on Render's free plan and sleeps when idle. The first request can take 30-50 seconds. Please wait and refresh once.

---

## Demo logins

Password for all accounts: `password123`

| Role | Email | Notes |
|---|---|---|
| Requester | requester@ptw.test | Creates, submits, activates and closes permits |
| Area Owner | areaowner@ptw.test | Owns **Boiler House** only |
| Safety Officer | safety@ptw.test | Approves any permit, suspends, verifies closure |
| Admin | admin@ptw.test | Full access |

Seeded data: 2 plants, 3 areas, 6 equipment items, 10 permits in different statuses.

**Seed dates are relative to when the seed runs.** If permits look expired, run `npm run seed` again (see below). Running it deletes all existing data.

### Good permits to try

- **PTW-0003** (Workshop, pending): the Area Owner cannot approve it, because it is outside Boiler House. No Approve button is shown, and the API returns 403 if called directly.
- **PTW-0004** (Boiler House, pending): the Area Owner approves, then the Safety Officer approves.
- **PTW-0005** (approved, start time passed): the Requester can activate it.
- **PTW-0006** (approved, starts in 2 hours): activation is refused until the start time.
- **PTW-0007** (active, ends in 1.5 hours): appears under "Expiring within 2 hours".
- **PTW-0008** (active): the Safety Officer can suspend it.
- **PTW-0009** (closed): the Safety Officer can verify it.
- **Conflict warning:** as Requester, create a Hot Work permit in Tank Farm on TNK-201 that overlaps PTW-0006 (Confined Space, same area).

---

## What problem it solves

On an industrial site, jobs like welding, confined-space entry, work at height and electrical isolation need written permission before anyone starts. On paper or in spreadsheets it is hard to prove who approved what, and when. This module keeps one record per permit, forces the right approvals, blocks work outside the approved time window, and keeps a full audit trail.

---

## Tech stack

- **Frontend:** React + TypeScript (Vite), deployed on Vercel
- **Backend:** Node + Express + TypeScript, deployed on Render
- **Database:** PostgreSQL (Neon) with Prisma
- **Auth:** email + password, JWT (8 hour expiry)
- **Tests:** Vitest

---

## Run it locally

You need Node 20+ and a PostgreSQL database (a free Neon database works).

**1. Server**

```
cd server
npm install
copy .env.example .env
```

Open `server/.env` and fill in:

```
DATABASE_URL=your postgres connection string
JWT_SECRET=any long random string
CRON_SECRET=any long random string
```

Then:

```
npm run migrate
npm run seed
npm run dev
```

The server runs on http://localhost:3000. Check http://localhost:3000/health.

**2. Client** (new terminal)

```
cd client
npm install
```

Create `client/.env` with:

```
VITE_API_URL=http://localhost:3000
```

Then:

```
npm run dev
```

Open the URL Vite prints and log in with a demo account.

**3. Tests**

```
cd server
npm test
```

---

## How it is built

### One permit model, type-specific data

All four permit types share one `Permit` table. Common fields (requester, contractor, work description, area, equipment, time window, hazards, PPE, precautions, status) are real columns. Type-specific fields (gas readings, lock numbers, height, etc.) live in one `typeData` JSON column, validated per type in `server/src/validation/permitTypes.ts`.

To add a fifth type such as Excavation: add one enum value, one validation schema, and one field group in the create form. The lifecycle, approvals, audit trail and dashboard do not change.

Trade-off: JSON fields cannot be queried or constrained by the database as easily as columns. I chose this because the four types have different fields and a new type should not need a migration.

### State machine

All rules are in `server/src/services/permitRules.ts` as plain functions with no database access, so they are easy to unit test. `permitService.ts` calls them inside a database transaction for every status change. Every illegal move returns a clear error: 409 for a wrong state, 403 for a wrong role or person.

Rules enforced on the server:

- A permit cannot go ACTIVE unless every required approver has approved.
- A permit cannot go ACTIVE before its planned start, or after its planned end.
- Expired permits can never be reactivated or resumed.
- Rejecting needs a reason. Closing needs completion notes.
- A person can never approve their own permit, including Admin and Safety Officer.
- An Area Owner can only approve permits in their own area.
- Only a Safety Officer (or Admin) can suspend, resume or verify.
- The person who raised a permit cannot verify its closure.

Concurrent changes are handled with a `version` column. If two people act at the same moment, the second gets a 409 and must refresh.

### Roles

Enforced in middleware (`requireRole`) and in the rules file, never only in the UI. The UI also hides buttons the user cannot use.

### Audit trail

Every state change, approval, rejection, suspension and draft edit writes an `AuditLog` row: who, what, when, from-status, to-status, field, old value, new value, comment. The permit page shows it as a timeline.

### Expiry

Expiry works in two ways:

1. **On read:** every time permits are listed or opened, overdue permits are moved to EXPIRED and an audit entry is written by a "System" user.
2. **Timer:** an outside timer (cron-job.org) calls `POST /internal/expire` every 5 minutes with the `x-cron-secret` header, so permits expire even when nobody has the app open.

### Conflict detection

When a Hot Work or Confined Space permit is created, the server checks for a permit of the other type in the same area with an overlapping time window (pending, approved or active). It returns a warning and still saves the permit. It warns rather than blocks because the decision belongs to the approvers.

### Notifications

Not built (out of scope). No email or SMS is sent.

---

## Decisions where the spec was silent

- **Approvers:** every permit type needs two approvals: the Area Owner of that area and a Safety Officer. This is one constant in `permitService.ts`, so it can change per type later.
- **Admin approving:** an Admin can approve on behalf of a required role, but never their own permit, and cannot fill both approval rows.
- **Editing:** a permit can only be edited while it is a DRAFT. After submission nothing can be changed, so the approvals always refer to the same content.
- **Who activates:** the Requester (own permit), Safety Officer or Admin.
- **Cancel:** allowed from any non-terminal state by the Requester (own permit), Safety Officer or Admin.
- **What expires:** permits waiting for approval, approved, active or suspended. Drafts do not expire.
- **Suspended permits:** they keep their end time. If it passes while suspended, the permit expires.
- **Permit numbers:** `PTW-0001`, `PTW-0002`, and so on.
- **Equipment check:** the server rejects a permit if the equipment does not belong to the chosen area.
- **System user:** automatic expiry is logged under `system@ptw.local`. Nobody can log in as it.

---

## What I knowingly left broken or unbuilt

**Missing from the spec**

- **No work log.** There is no endpoint to log work against a permit, so the rule "work cannot be logged unless ACTIVE" is not applicable yet. The confined-space entry/exit log is also not built.
- **No admin screens.** Admin has full API access, but there are no screens to manage users, areas or equipment. Use the seed or the database.
- **No extension requests.**
- **No QR code, no digital signature, no countdown timer** on active permits.
- **Not designed mobile-first.** The layout works on a phone but is not tuned for gloves or sunlight.

**Known bugs and weak points**

- **"My approvals pending"** returns nothing for the Admin role, because approval rows are created for Area Owner and Safety Officer only.
- **Permit numbers** come from a row count. Two permits created at the same instant could collide (the unique constraint would then return a 500), and deleting rows would reuse numbers. A database sequence would fix this.
- **Type-specific fields** are fully validated on submit, not when saving a draft. Drafts can hold incomplete data.
- **Create form** takes some fields as free text (for example "welding / grinding") instead of dropdowns, and true/false fields are typed as text.
- **Tests** cover the state machine, permission rules and permit-type validation. There are no tests that call the API end to end.
- **Security basics:** the token is kept in `localStorage`, CORS is open to all origins, and there is no rate limiting on login.
- **Free hosting:** the API sleeps when idle.

---

## What I would build next

1. Work log endpoint (blocked unless ACTIVE) and the confined-space entry/exit log.
2. Extension requests with a cap, re-approval by the Safety Officer, and an audit entry.
3. Admin screens for users, areas and equipment.
4. API-level tests for the illegal-transition and wrong-role cases.
5. Countdown on active permits and a mobile-first permit view with large buttons.
6. Permit numbers from a database sequence.

---

## Use of AI

I used Claude as a coding assistant. It helped with:

- The automatic expiry function and the cron-protected `/internal/expire` route
- The area and equipment lookup routes and the dependent dropdowns in the create form


My own part: I chose what to build and what to leave out, reviewed the code, set up the databases and the Render, Vercel and cron-job.org deployments, seeded the live database, and tested the app as each role. [Add here what you designed or wrote yourself, for example the data model, permit type validation or state rules. Only write what is true.]

---

## Project structure

```
client/                 React app
  src/pages/            Dashboard, CreatePermit, PermitDetail, Login
  src/lib/              Which actions each role sees
server/
  prisma/               schema.prisma, migrations, seed.ts
  src/routes/           auth, permits, lookup
  src/services/         permitRules.ts (pure rules), permitService.ts (transactions)
  src/validation/       Per-type validation
  tests/                Vitest tests
```