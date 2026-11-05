<div align="center">

# AkewTutor · Backend

**The API behind tutor matching, lessons, and learning activity.**

![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

[Frontend](https://github.com/AkewTutor/frontend) · [Backend](https://github.com/AkewTutor/backend) · [Documentation](https://github.com/AkewTutor/docs)

</div>

---

## Overview

AkewTutor is an online tutoring platform for Ethiopian learners. This repository provides its Express API, PostgreSQL data model, and business logic for student, parent, tutor, and admin workflows.

## Video demonstration

> **Video link pending** — replace `VIDEO_URL_HERE` with the final **5-minute demonstration with voice-over** before submission.

[▶ Watch the project demonstration](VIDEO_URL_HERE)
## API responsibilities

| Domain | Responsibilities |
| :--- | :--- |
| **Accounts** | Registration, verification, JWT authentication, profiles, and guardianship. |
| **Matching** | Tutor search, recommendations, cohorts, and format changes. |
| **Class delivery** | Scheduling, meeting links, rescheduling, assessments, recordings, and materials. |
| **Communication** | Cohort conversations, notifications, and announcements. |
| **Payments** | Chapa checkout and callbacks, payment history, pricing, refunds, and earnings. |
| **Engagement** | XP, streaks, badges, challenges, and leaderboards. |
| **Administration** | Tutor review, reports, complaints, disputes, and support details. |

## Technology

**Node.js, Express 5, TypeScript, Prisma, and PostgreSQL** form the core stack. The API uses Zod validation, JWT authentication, bcrypt password hashing, and Pino logging. Tests use Vitest, Supertest, and Playwright.

## Run locally

Install **Node.js 22**, npm, and Docker with Compose. A separately installed PostgreSQL server can also be used by adjusting `DATABASE_URL`.

```bash
git clone https://github.com/AkewTutor/backend.git
cd backend
npm ci
cp .env.example .env
```

### Configure the environment

The complete variable list is in `.env.example`. For the supplied local database, set:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/akewtutor_dev
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-local-secret
```

Also configure the required email, SMS, payment, storage, and admin seed variables shown in the example. Local mocks can receive development email, SMS, and payment requests. Storage requires its own configured S3-compatible service.

### Prepare the database

```bash
docker compose up -d
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

The seed creates the admin account, subjects, and default pricing. Configure `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` in `.env` before seeding.

### Start the API

```bash
npm run dev
```

The default API base URL is **http://localhost:3000/api/v1**.

### Optional local provider mocks

Run the mock script in another terminal:

```bash
npx tsx scripts/dev-mocks.ts
```

Point the corresponding variables in the API’s `.env` to these services:

```dotenv
GEEZ_SMS_BASE_URL=http://localhost:4002
BREVO_BASE_URL=http://localhost:4003
CHAPA_BASE_URL=http://localhost:4001
```

The mock inboxes are available at `http://localhost:4003/__test__/emails` and `http://localhost:4002/__test__/messages`. Mock checkout behavior depends on the checked-out branch.

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start the API with file watching. |
| `npm run build` | Compile the TypeScript app. |
| `npm start` | Run the compiled API after a build. |
| `npm test` | Run unit tests. |
| `npm run test:integration` | Run integration tests using the configured test database. |
| `npm run test:e2e` | Run Playwright end-to-end tests. |
| `npm run lint` | Run ESLint. |
| `npm run prisma:generate` | Regenerate Prisma Client. |
| `npm run prisma:migrate:test` | Apply migrations using `.env.test`. |

Configure the dedicated test database before integration tests. The frontend runs separately.

## Code layout

```text
src/
├── routes/       # HTTP endpoints
├── controllers/  # Request and response handling
├── services/     # Business logic
├── schemas/      # Zod validation
├── middlewares/  # Authentication and error handling
├── config/       # Environment and database configuration
└── utils/        # Shared helpers and provider clients
prisma/           # Schema, migrations, and seed
scripts/          # Local mocks and development utilities
tests/            # Unit, integration, and end-to-end tests
```

## Development status

The backend is under active development. Background scheduling, feature triggers, and external provider workflows have remaining implementation and verification work. The demonstration uses prepared records and local provider mocks. API contracts and requirements are maintained in the [documentation repository](https://github.com/AkewTutor/docs).

## Developer

AkewTutor is an individual project designed and developed by **Adonay Chilotu**.

| Full name | CTC ID |
| :--- | :--- |
| Adonay Chilotu | **CTC-1611-26** |
