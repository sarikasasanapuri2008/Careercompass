# CareerCompass AI

A career and exam eligibility companion that compares a candidate profile with sample government exams and private roles, then offers grounded AI guidance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Express API
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:career-compass` — idempotently seed six sample opportunities
- Required env: `DATABASE_URL`, `GEMINI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/career-compass-ai/src/App.tsx` and `src/index.css` — single-page UI and theme
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/db/src/schema/career-compass.ts` — profile and opportunity schema
- `artifacts/api-server/src/routes/career-compass.ts` — profile, opportunity, eligibility, match, and chat endpoints
- `artifacts/api-server/src/lib/eligibility.ts` — deterministic rule engine
- `scripts/src/seed-career-compass.ts` — sample opportunity data

## Architecture decisions

- Use the workspace PostgreSQL database rather than SQLite to match the monorepo's shared Drizzle setup.
- A random browser-local profile ID keeps the MVP account-free; email is nullable and not requested.
- AI endpoints use the official `@google/genai` SDK with `GEMINI_API_KEY` stored as a Replit Secret.
- Profile match/chat calls send profile details and the selected opportunity to Google Gemini; the UI discloses this.
- Eligibility results are first-pass guidance. Category-based age relaxation can yield `POSSIBLY_ELIGIBLE`; official notices remain authoritative.

## Product

Candidates can save a lightweight profile, browse three government exams and three private-role examples, check age/degree/branch rules, view AI match gaps, and ask opportunity-grounded questions.

## User preferences

_No additional project-specific preferences recorded._

## Gotchas

- Seeded age, qualification, and branch values are illustrative and must be checked against current official notices; private-role requirements vary by employer.
- After changing `lib/api-spec/openapi.yaml`, run API codegen before typechecking consumers.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
