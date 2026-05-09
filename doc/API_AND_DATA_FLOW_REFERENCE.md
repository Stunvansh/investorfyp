# API & Data Flow Reference

Base API root: `http://127.0.0.1:8000/api`

---

## 1) Authentication & identity

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/auth/register/` | POST | Public | Create user account |
| `/auth/token/` | POST | Public | Get JWT access/refresh token |
| `/auth/token/refresh/` | POST | Public | Refresh access token |
| `/auth/me/` | GET | JWT | Current user profile |
| `/auth/me/` | PATCH | JWT | Partial user profile update |

Notes:
- Custom user model uses email as username.
- Frontend consumes `/auth/me/` for session identity after login.

---

## 2) Proposal domain

| Endpoint | Method | Role access | Purpose |
|---|---|---|---|
| `/proposals/` | GET | auth | list proposals by role filter |
| `/proposals/` | POST | entrepreneur | create proposal |
| `/proposals/{id}/` | GET | auth | proposal detail |
| `/proposals/{id}/` | PATCH/PUT | admin, proposal owner entrepreneur | edit proposal |
| `/proposals/{id}/approve/` | POST | admin | approve pending proposal |
| `/proposals/{id}/set_milestone/` | POST | admin or proposal owner entrepreneur | update milestone |

Role-based list behavior:
- admin: all proposals
- entrepreneur: own proposals only
- investor: approved proposals only

---

## 3) Investor signals

| Endpoint | Method | Role access | Purpose |
|---|---|---|---|
| `/signals/` | GET | auth | list role-filtered signals |
| `/signals/` | POST | investor | create signal on approved proposal |
| `/signals/{id}/` | PATCH | admin or target entrepreneur | accept/reject/update signal |

Important rules:
- signals allowed only for approved proposals
- duplicate pending same-type signals blocked
- when status becomes `accepted`, backend ensures a chat room exists for that proposal

---

## 4) Escrow & wallet ledger

| Endpoint | Method | Role access | Purpose |
|---|---|---|---|
| `/transactions/` | GET | auth | role-filtered transaction history |
| `/transactions/` | POST | auth (rule-enforced) | create invest/release/refund transaction |
| `/wallet/balance/` | GET | investor only | wallet summary (balance, invested, refunded) |
| `/escrow-summary/` | GET | auth | aggregated escrow totals + per proposal breakdown |

Transaction rules:
- `invest`: investor only, approved proposal only, cannot exceed remaining funding
- `release` / `refund`: admin only, cannot exceed current escrow

Escrow formula per proposal:
`escrow = sum(invest) - sum(release) - sum(refund)`

---

## 5) Messaging APIs

Prefix: `/messages/`

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/messages/send/` | POST | JWT | send message for proposal thread |
| `/messages/proposal/{proposal_id}/` | GET | JWT + participant check | get paginated thread messages |
| `/messages/{message_id}/read/` | POST | JWT + recipient check | mark single message as read |
| `/messages/unread-count/` | GET | JWT | total + by-proposal unread count |
| `/messages/chats/` | GET | JWT | list chat rooms for current user |

Behavioral notes:
- Rate limit decorator on send endpoint (50 messages/hour per user)
- unread count endpoint caches short-lived values
- retrieving thread marks unread messages as read for that viewer

---

## 6) Payments APIs (Stripe)

| Endpoint | Method | Role access | Purpose |
|---|---|---|---|
| `/payments/create-intent/` | POST | investor | create Stripe PaymentIntent + PaymentAttempt |
| `/payments/status/{intent_id}/` | GET | investor owner or admin | check/sync intent status |
| `/payments/webhook/` | POST | public (signature verified) | receive Stripe webhooks and sync ledger |

Lifecycle:
1. investor creates intent
2. frontend confirms card via Stripe.js
3. webhook (or status fallback sync) updates PaymentAttempt
4. on succeeded, backend writes `WalletTransaction(action='invest', method='stripe')`

---

## 7) Standardized list response contract
Most list endpoints return:
```json
{
  "data": [...],
  "count": 0,
  "next": null,
  "previous": null
}
```

The frontend parser also handles legacy array/value wrappers for robustness.

---

## 8) Frontend API usage map

| Frontend function (`src/lib/api.ts`) | Backend endpoint |
|---|---|
| `getProposals()` | `GET /proposals/` |
| `createProposal()` | `POST /proposals/` |
| `approveProposal()` | `POST /proposals/{id}/approve/` |
| `updateProposalMilestone()` | `POST /proposals/{id}/set_milestone/` |
| `getSignals()` | `GET /signals/` |
| `createSignal()` | `POST /signals/` |
| `updateSignalStatus()` | `PATCH /signals/{id}/` |
| `getTransactions()` | `GET /transactions/` |
| `createTransaction()` | `POST /transactions/` |
| `getWalletBalance()` | `GET /wallet/balance/` |
| `createPaymentIntent()` | `POST /payments/create-intent/` |
| `getPaymentStatus()` | `GET /payments/status/{id}/` |
| `getChatRooms()` | `GET /messages/chats/` |
| `getMessages()` | `GET /messages/proposal/{id}/` |
| `sendMessage()` | `POST /messages/send/` |
| `markMessageAsRead()` | `POST /messages/{id}/read/` |
| `getUnreadCount()` | `GET /messages/unread-count/` |

---

## 9) Data consistency checkpoints for replication
- keep server-side role filters in list endpoints
- enforce transaction constraints server-side (never trust frontend)
- create chat room on accepted signal transition
- maintain standardized list response envelope
- validate frontend-bound payloads with runtime schemas (zod or equivalent)
