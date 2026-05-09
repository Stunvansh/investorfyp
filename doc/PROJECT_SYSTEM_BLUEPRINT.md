# VentureLedger Exchange / EscrowHub — System Blueprint

## 1) What this project is
This is a **role-based entrepreneur–investor collaboration platform** with:
- proposal publishing and moderation,
- investor intent signaling,
- escrow-style transaction ledger,
- Stripe card payment intent integration,
- chat threads between founders and investors,
- and an admin control panel for moderation/dispute actions.

The implemented product combines:
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Django 6 + DRF + JWT auth
- **Database**: SQLite (local development)
- **Observability**: Sentry frontend + backend
- **Payments**: Stripe PaymentIntent + webhook synchronization

---

## 2) Proposal vision vs implemented reality
From `proposal.txt`, the intended vision includes secure matchmaking, verification, transparent communication, and milestone/escrow progress.

### Implemented and aligned
- Role-based platform for entrepreneur, investor, admin
- Proposal lifecycle with approval gate
- Messaging between parties
- Investment ledger with release/refund actions
- Milestone tracking

### Different from proposal wording
- Proposal mentions MongoDB/Firebase; implementation uses **SQLite + Django ORM**.
- Proposal mentions WebSockets for streaming/chat; implementation chat is **REST polling (every 3s)**.
- “Contract signing/live pitching” is represented in a lighter form via proposal fields (`document_name`, `pitch_video_url`), not full e-signature/live stream engines.

---

## 3) High-level architecture

## Frontend (`new project/`)
- `src/App.tsx` = primary state-machine UI (all pages)
- `src/Components/chat/*` = chat list + chat room views
- `src/Components/payment/StripeEscrowCheckout.tsx` = Stripe card checkout
- `src/lib/api.ts` = typed API client
- `src/lib/validation.ts` = zod runtime schema validation
- `src/lib/apiResponseParser.ts` = standardized response parser

## Backend (`backend/`)
- `accounts/` = custom user model and auth-related views
- `marketplace/` = proposals, investor signals, wallet transactions, escrow summary
- `messaging/` = message/chat room/notification APIs
- `payments/` = Stripe payment intents + payment attempt state + webhook sync
- `config/urls.py` = top-level routing

---

## 4) Core domain objects

## User (`accounts.User`)
Roles:
- `entrepreneur`
- `investor`
- `admin`

Key trust flags:
- `verified` (boolean)
- `frozen` (boolean)

## Proposal (`marketplace.Proposal`)
- status: `pending | approved`
- milestone: `Not Started | In Progress | Completed`
- entrepreneur owner
- funding amount, category, timeline, doc filename, pitch video URL

## InvestorSignal (`marketplace.InvestorSignal`)
- type: `interest | contact | meeting`
- status: `pending | accepted | rejected`
- ties investor + entrepreneur + proposal
- accepted signal can auto-create ChatRoom

## WalletTransaction (`marketplace.WalletTransaction`)
- action: `invest | release | refund`
- method: `virtual-escrow | stripe | jazzcash | easypaisa`
- ledger event model for escrow state

## Messaging
- `Message`: sender, recipient, proposal, content, read flag
- `ChatRoom`: one-to-one with proposal, investor + entrepreneur participants
- `MessageNotification`: unread tracking layer

## PaymentAttempt (`payments.PaymentAttempt`)
- tracks Stripe intent status lifecycle
- used to prevent over-committing proposal funding before final settlement

---

## 5) Role capabilities (implemented)

## Entrepreneur
- Sign up/login
- Edit profile fields (business idea, funding requirement, docs)
- Submit proposal (starts pending)
- See own proposals (pending + approved)
- Update own proposal milestone
- Receive investor signals and accept/reject
- Use chat with investors
- View escrow/release outcomes on wallet page

## Investor
- Sign up/login
- Edit profile fields (investment interest, budget range)
- Browse approved proposals only
- Filter proposals by category + max budget
- Send signal (`interest`)
- Open chat threads
- Invest via virtual escrow ledger or Stripe card flow
- View wallet balance and transaction history

## Admin
- Login via credentials (frontend demo shortcut)
- Approve proposals
- Set proposal status back to pending
- Moderate user verification/freeze (frontend local state controls)
- Resolve disputes (frontend quick actions + escrow management panel)
- Perform release/refund through escrow management form (backend-backed path)

---

## 6) End-to-end lifecycle (canonical flow)
1. Entrepreneur creates account and submits proposal.
2. Proposal remains `pending` until admin approval.
3. Investor browses `approved` proposals and sends interest signal.
4. Entrepreneur accepts signal → chat room can be created.
5. Investor invests (virtual escrow or Stripe). Ledger records `invest`.
6. Milestones progress (`Not Started -> In Progress -> Completed`).
7. Admin resolves settlement via `release` or `refund` (reducing escrow).
8. Both parties view updated transaction and escrow state.

---

## 7) Response contract standardization
List endpoints are standardized to:
```json
{
  "data": [...],
  "count": 12,
  "next": null,
  "previous": null
}
```

The frontend parser still supports legacy variants (array and `{ value: [...] }`) for backward compatibility.

---

## 8) Known implementation nuances (important for replication)
- Chat is REST + polling, not real-time sockets.
- Some admin UI actions are local-state convenience actions and may not persist to backend unless routed through API-backed methods.
- Proposal/Signal/Transaction list access is role-filtered server-side.
- Funding checks include both committed ledger investments and active payment attempts.
- Wallet balance endpoint hardcodes `max_balance = 300000` as baseline for investor simulation.

---

## 9) Recommended doc reading order
1. `PROJECT_SYSTEM_BLUEPRINT.md` (this file)
2. `ROLE_AND_SCENARIO_PLAYBOOK.md`
3. `SCREEN_TAB_BUTTON_FUNCTIONALITY.md`
4. `API_AND_DATA_FLOW_REFERENCE.md`
5. `REPLICATION_FROM_SCRATCH_GUIDE.md`
