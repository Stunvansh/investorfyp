# Notes: ProjectFYP System Deep Dive

## Proposal Understanding
- Vision: secure entrepreneur-investor collaboration platform with trust, profile verification, communication, and investment workflows.
- Planned stack in proposal: React + Django + JWT + WebSockets + cloud deployment.
- Actual implementation divergence:
  - Uses Django + DRF + SQLite (not MongoDB/Firebase).
  - Chat uses REST polling every 3s (no WebSocket implementation).
  - Escrow is ledger-driven via WalletTransaction + Stripe PaymentAttempt webhook sync.

## Backend Findings
- Core apps: accounts, marketplace, messaging, payments.
- Auth: custom User model (email login), JWT via SimpleJWT.
- Roles: investor, entrepreneur, admin.
- Key models:
  - Proposal (pending/approved + milestone Not Started/In Progress/Completed)
  - InvestorSignal (interest/contact/meeting; pending/accepted/rejected)
  - WalletTransaction (invest/release/refund; method virtual-escrow/stripe/jazzcash/easypaisa)
  - Message, ChatRoom (OneToOne with proposal), MessageNotification
  - PaymentAttempt for Stripe status lifecycle
- Permission highlights:
  - Only entrepreneur creates proposals.
  - Only admin approves proposals.
  - Only investor creates signals.
  - Signal accepted => chat room auto-created.
  - Only investor can invest.
  - Only admin can release/refund escrow.

## Frontend Findings
- Single-page state-machine app in App.tsx with pages:
  landing, auth, profile, dashboard, proposals, wallet, chat, admin.
- Top-level role UX:
  - Entrepreneur: submit proposals, track milestones, review incoming signals.
  - Investor: browse approved proposals, send interest, invest via wallet/Stripe, chat.
  - Admin: moderation (verify/freeze users, approve proposals, resolve disputes).
- Chat components:
  - ChatListPage: list chats and unread counts.
  - ChatWindow: polling thread (3s), send/read messages.
- Payment component:
  - StripeEscrowCheckout confirms card payment and polls backend payment status.

## Role-Based Flows
- Entrepreneur: sign up/login -> profile -> submit proposal -> wait for admin approval -> receive investor requests -> accept/reject -> chat -> milestone updates -> receive release.
- Investor: sign up/login -> profile -> browse approved proposals with filters -> send interest -> chat -> invest (virtual or Stripe) -> track wallet.
- Admin: login -> moderate users/proposals -> resolve release/refund disputes -> monitor escrow management.

## Replication Blueprint
- Recreate in layered order:
  1) Identity and JWT auth
  2) Proposal lifecycle
  3) Investor signal workflow
  4) Escrow ledger + role-enforced settlement
  5) Chat room + unread notifications
  6) Stripe intent + webhook persistence
  7) Admin governance workflows
- Keep standardized list response contract: { data, count, next, previous }.
