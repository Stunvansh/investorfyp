# InvestorFYP VentureLedger System Design

**Date:** 2026-05-06  
**Status:** Approved by user instruction to proceed with all recommended defaults.

## 1) Problem and scope
Build a production-ready role-based entrepreneur–investor collaboration platform with:
- secure authentication and role boundaries,
- proposal submission + moderation,
- investor signaling and messaging,
- escrow-style transaction ledger,
- Stripe card investment support,
- admin release/refund controls,
- and an end-to-end modern but simple/sleek UI.

## 2) Selected defaults (recommended path)
- **Database:** PostgreSQL from day 1.
- **Signup model:** Open signup for entrepreneur/investor; admin created manually.
- **Chat v1:** REST + polling (2–3s interval), websocket upgrade in later phase.
- **Frontend style direction:** simple, sleek, not over-modern.
- **Design workflow:** Create screen system in Stitch first, then implement in React.

## 3) Approaches considered

### Approach A (Selected): Monorepo split with Django + React + PostgreSQL
- Backend: Django + DRF + JWT + Stripe integration.
- Frontend: React + TypeScript + Vite + Tailwind.
- Pros: strong ecosystem, fast delivery, role/auth patterns fit requirements, clear API ownership.
- Cons: more boilerplate than BaaS.

### Approach B: BaaS-heavy (Firebase/Supabase) with thin backend
- Faster initial setup but harder escrow/payment rule enforcement and audit-trail governance.
- Rejected for production control and business-rule correctness risk.

### Approach C: Event-driven microservices from day 1
- Highly scalable but premature for current scope and team velocity.
- Rejected by YAGNI and delivery timeline.

## 4) Architecture design

### 4.1 Backend services
- `accounts`: custom user model, JWT auth, profile updates, admin-only controls.
- `marketplace`: proposals, signals, transactions, escrow summary.
- `messaging`: chats, messages, unread counts.
- `payments`: Stripe payment intents, attempt tracking, webhook idempotency.
- `audit`: moderation and settlement action logs.

### 4.2 Frontend modules
- App shell + role-aware navigation.
- Pages: Landing, Auth, Profile, Dashboard, Proposals, Wallet, Chat, Admin.
- API client with response envelope parsing and runtime schema validation.
- Uniform loading/error/success UX.

### 4.3 Data model
Core tables: User, Proposal, InvestorSignal, WalletTransaction, PaymentAttempt, ChatRoom, Message, MessageNotification, AuditLog.

### 4.4 Security model
- Strict RBAC on server mutations.
- Admin role non-self-assignable.
- Input validation at serializer/schema level.
- JWT refresh and auth guard middleware.
- Rate limiting for auth/chat endpoints.

### 4.5 Escrow correctness rules
- `invest` only by investor on approved proposal.
- Cap by remaining funding and investor balance.
- `release/refund` admin-only and escrow-bounded.
- Proposal escrow computed by ledger equation:
  `sum(invest) - sum(release) - sum(refund)`.

### 4.6 Payments
- Create Stripe PaymentIntent -> confirm client-side -> webhook sync.
- Idempotency via Stripe event ID + payment attempt state transitions.

### 4.7 Chat
- Polling endpoint every 3s in active thread.
- Read-state update and unread aggregation endpoint.

## 5) Error handling strategy
- Consistent API envelope and typed error payload.
- Domain errors surfaced with actionable UI messages.
- Retry flow for transient failures; hard-stop for authorization errors.
- Sentry integration frontend/backend.

## 6) Test strategy
- Backend: pytest for auth/RBAC, proposal lifecycle, signal dedupe, escrow arithmetic, payments webhook idempotency, chat permissions.
- Frontend: Vitest + React Testing Library for core flows.
- E2E: Playwright scenario tests by role.
- CI: lint + unit + integration + e2e smoke.

## 7) Stitch-first design execution
1. Create Stitch project.
2. Create a design system (simple sleek visual language).
3. Generate all key screens:
   - Landing/Auth
   - Entrepreneur dashboard
   - Investor dashboard
   - Proposals
   - Wallet
   - Chat
   - Admin panel
4. Use generated screens as layout baseline and implement React views without breaking visual hierarchy.

## 8) Delivery sequence
1. Foundation setup (repo, env, CI baseline).
2. Backend APIs + DB migrations.
3. Frontend app shell + auth + role routing.
4. Domain modules (proposal/signal/escrow/chat/payments/admin).
5. Test pass and verification.
6. Local production-like runbook.
