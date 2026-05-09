# Role & Scenario Playbook

This document explains **how each actor uses the system** and all important scenario branches.

---

## 1) Entrepreneur scenarios

## Scenario E1 — Onboarding and profile
1. Open landing page.
2. Click **Join as Entrepreneur**.
3. In Auth page:
   - Role = Entrepreneur
   - Mode = Create Account or Sign In
4. Submit credentials.
5. After successful signup, user is routed to **Profile** page.
6. Entrepreneur can fill:
   - Business Idea
   - Funding Required
   - Startup Documents filename

Expected state:
- User exists in backend with role `entrepreneur`.
- Local UI shows verification/frozen pills.

## Scenario E2 — Submit proposal
1. Navigate to **Proposals**.
2. Fill form:
   - Business title
   - Startup details
   - Description
   - Category
   - Required funding
   - Timeline
   - Documents filename
   - Pitch video URL
3. Click **Submit Proposal**.

Validation gates:
- title/startup details required
- funding > 0
- document name + pitch URL required

Result:
- Proposal is created in backend as `pending`.
- Entrepreneur sees proposal in own list.

## Scenario E3 — Track dashboard and milestones
1. Open **Dashboard** (entrepreneur view).
2. Switch between tabs:
   - Overview
   - My Proposals
3. Under milestone progress, update status via dropdown.

Result:
- Frontend updates state immediately.
- Backend milestone endpoint is called (`set_milestone`).

## Scenario E4 — Handle investor requests
1. In dashboard “Investor Requests”, review incoming signals.
2. Click **Accept** or **Reject**.

Result:
- Signal status updated.
- If accepted, backend creates/updates chat room for that proposal.

## Scenario E5 — Chat after accepted signal
1. Open **Chat**.
2. Select proposal thread.
3. Read/send messages.
4. Polling refreshes every 3 seconds.

Result:
- Messages are persisted.
- Read states and unread counts are updated.

## Scenario E6 — Entrepreneur wallet view
1. Open **Wallet**.
2. See:
   - Funds released to you
   - Escrow across your proposals
   - Transaction rows

Note:
- Entrepreneur does not initiate payment method selection or deposit actions.

---

## 2) Investor scenarios

## Scenario I1 — Onboarding and profile
1. Join/Login as investor.
2. Update profile fields:
   - Investment interest
   - Budget range

## Scenario I2 — Browse approved proposals
1. Open Proposals page.
2. Use filters:
   - Category
   - Max budget
3. See only approved opportunities.

Backend behavior:
- Investor proposal list is server-filtered to approved only.

## Scenario I3 — Express interest
1. Enter message in “Message Founder”.
2. Click **Interested** on proposal card.

Rules:
- Duplicate pending signal of same type is blocked.
- If signal already exists, flow routes to chat context.

Result:
- Signal created (status pending) and associated with proposal + entrepreneur.

## Scenario I4 — Open chat thread
1. If signal accepted (or existing path), open chat.
2. Exchange due diligence / negotiation messages.

## Scenario I5 — Invest via virtual escrow
1. Open Wallet page.
2. Payment method = Escrow Wallet.
3. Select approved proposal + amount.
4. Click **Hold in Escrow**.

Rules:
- Only investors can invest.
- Proposal must be approved.
- Amount cannot exceed remaining funding requirement.
- Amount cannot exceed investor balance.

Result:
- `WalletTransaction(action='invest')` created.
- Escrow balance increases.

## Scenario I6 — Invest via Stripe
1. Wallet page -> Payment Method = Stripe.
2. Stripe checkout card form appears.
3. Enter card details and submit.
4. Stripe confirms intent; frontend polls backend status.
5. Webhook or status sync writes ledger investment.

Result:
- PaymentAttempt updated to succeeded.
- WalletTransaction (method `stripe`) is persisted.

## Scenario I7 — Track wallet balance and history
1. Wallet shows available capital and transaction table.
2. Backend wallet endpoint calculates:
   - invested total
   - refunded total
   - balance = 300000 - invested + refunded

---

## 3) Admin scenarios

## Scenario A1 — Login and moderation dashboard
- Admin enters via auth (demo credentials button in UI).
- Lands in admin page with modules:
  - User Management
  - Proposal Moderation
  - Dispute Resolution
  - Escrow Management

## Scenario A2 — User verification/freeze toggles
- Verify/Unverify and Freeze/Unfreeze controls exist in UI.
- Current implementation updates frontend state (client-side) unless custom backend path is added.

## Scenario A3 — Proposal moderation
- Approve pending proposal.
- Revert to pending if needed.

Result:
- Approval action calls backend `/proposals/{id}/approve/`.

## Scenario A4 — Escrow settlement
Two admin paths exist:
1. **Dispute quick actions** (Release/Refund in dispute card): local convenience mutation.
2. **Escrow Management form** (Release/Refund by proposal + amount): goes through wallet transaction API and enforces escrow limits.

Recommended canonical path for production replication:
- Use API-backed escrow management path only.

---

## 4) Cross-role scenario map

## Scenario X1 — Full happy path
Entrepreneur submits -> Admin approves -> Investor sends interest -> Entrepreneur accepts -> Chat opens -> Investor invests -> Admin releases -> Entrepreneur sees funds received.

## Scenario X2 — Refund path
Investor invests -> dispute occurs -> Admin refunds -> Investor wallet increases by refunded amount.

## Scenario X3 — Access control enforcement
- Non-investor cannot create invest transaction.
- Non-admin cannot release/refund.
- Non-participant cannot access proposal chat messages.
- Investors cannot signal non-approved proposals.

---

## 5) Error/edge scenarios to model in a rebuilt version
- Duplicate pending signal attempts.
- Investment amount beyond remaining funding.
- Release/refund greater than escrow balance.
- Missing Stripe keys.
- Webhook signature failures.
- Token expiry / unauthorized access.
- API returns unexpected shape (frontend zod validation catches).
