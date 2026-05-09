# Replication from Scratch Guide (Advanced)

This guide is the practical blueprint to recreate this system cleanly, with better production readiness.

---

## 1) Product modules to rebuild
1. Identity and role management
2. Proposal lifecycle engine
3. Investor intent signaling
4. Escrow ledger and settlement controls
5. Chat and unread notification layer
6. Stripe payment intent + webhook sync
7. Admin moderation console
8. Monitoring/observability

---

## 2) Recommended implementation order

## Phase A — Foundation
- Setup monorepo structure (`backend/`, `frontend/`)
- JWT auth + refresh
- custom user model with roles
- environment configuration and secret management
- health check endpoint

## Phase B — Marketplace core
- Proposal model, serializer, role-aware list filters
- Proposal create/approve/update workflows
- InvestorSignal model + duplicate prevention
- signal acceptance transition hooks

## Phase C — Escrow domain
- WalletTransaction ledger model
- strict business rules:
  - invest only for approved proposals
  - enforce remaining funding cap
  - release/refund admin-only and escrow-bounded
- wallet balance + escrow summary endpoints

## Phase D — Communication
- ChatRoom (proposal-scoped) + Message + MessageNotification
- Thread list and unread count endpoints
- Message send/read flows
- Initially use polling; upgrade to websocket pub/sub later

## Phase E — Payments
- PaymentAttempt model and statuses
- Stripe create-intent endpoint
- webhook endpoint with signature validation
- idempotent ledger write on success

## Phase F — Frontend orchestration
- Page routing/state machine (or true router)
- role-aware nav and views
- API layer + runtime schema validation
- robust UX for loading/error/sync states

## Phase G — Admin hardening
- convert all local-only moderation toggles into backend endpoints
- audit logs for verification/freeze/status changes
- dispute record model (instead of static dispute card)

---

## 3) Database schema essentials

Mandatory entities:
- User
- Proposal
- InvestorSignal
- WalletTransaction
- PaymentAttempt
- ChatRoom
- Message
- MessageNotification

Critical relationships:
- Proposal -> entrepreneur (FK)
- Signal -> proposal + investor + entrepreneur
- WalletTransaction -> proposal + investor + entrepreneur
- ChatRoom -> proposal (OneToOne)
- Message -> sender + recipient + proposal
- PaymentAttempt -> proposal + investor

---

## 4) Business rules to preserve
- Proposal visibility:
  - investor: only approved
  - entrepreneur: own only
  - admin: all
- Signal creation:
  - investor only
  - approved proposal only
  - no duplicate pending same-type signal
- Chat permission:
  - only proposal participants
- Escrow constraints:
  - no over-invest beyond funding requirement
  - no release/refund above escrow
- Payment consistency:
  - webhook/status sync must be idempotent

---

## 5) Suggested production upgrades (important)

## Security
- Forbid self-registration into admin role.
- Add RBAC guards on every sensitive mutation.
- Add rate limits to auth and message endpoints.
- Use HTTPS and secure token storage strategy.

## Data integrity
- Add transaction-level locking for escrow critical writes.
- Add uniqueness constraints where duplicate logic matters.
- Add explicit dispute model for release/refund governance.

## Chat realtime
- Replace polling with WebSockets (Django Channels or separate gateway).
- Keep unread counters synchronized via events.

## Payment reliability
- Retry-safe webhook processing.
- Store Stripe event IDs to prevent duplicate processing.
- Dead-letter handling for failed webhook syncs.

## Admin operations
- Persist verify/freeze actions with backend APIs.
- Add moderation history/audit trail.

---

## 6) Frontend reconstruction blueprint

## Page map
- Landing
- Auth
- Profile
- Dashboard (entrepreneur/investor variants)
- Proposals
- Wallet
- Chat
- Admin

## State model to keep
- auth/session state
- current user + role
- domain caches: proposals, signals, transactions
- chat context: selected proposal/thread
- API sync and error banners

## API client strategy
- centralized API module
- attach auth header in one place
- parse + validate responses via zod-like runtime validators
- map backend shapes to UI domain models

---

## 7) Test strategy for a recreated build

Minimum required suites:
1. Role-based authorization tests
2. Proposal lifecycle tests
3. Signal duplicate/acceptance tests
4. Escrow arithmetic tests (invest/release/refund)
5. Payment intent + webhook sync tests
6. Chat access and unread count tests
7. End-to-end happy path across all roles

---

## 8) Deployment blueprint

## Backend
- Deploy Django API with managed DB (PostgreSQL recommended in production)
- Configure env vars:
  - JWT secrets
  - Stripe keys
  - Sentry DSN

## Frontend
- Vite build + CDN/static host
- Configure runtime env for API base and Stripe public key

## Ops
- health checks
- log aggregation
- Sentry alerts
- backup strategy for transactional data

---

## 9) Checklist for parity with current project
- [ ] Entrepreneur can submit pending proposal
- [ ] Admin can approve proposal
- [ ] Investor sees only approved proposals
- [ ] Investor can send signal
- [ ] Accepted signal creates usable chat thread
- [ ] Investor can invest (virtual + Stripe)
- [ ] Admin can release/refund with constraints
- [ ] Wallet and escrow totals reconcile with ledger
- [ ] All list APIs return standardized envelope

---

## 10) If you want “v2 advanced” from this baseline
Recommended additions:
- legal contracts & signature workflow
- milestone evidence upload/review gates
- due diligence checklist module
- investor scoring/recommendation engine
- full compliance/KYC workflow
- event-driven architecture for payment + chat + notifications
