# InvestorFYP Production System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and verify a production-ready VentureLedger entrepreneur–investor collaboration system with role-based auth, proposals, signals, chat, escrow ledger, Stripe payments, and admin moderation.

**Architecture:** A monorepo with Django/DRF backend and React/Vite frontend, both container-ready and environment-configured for PostgreSQL. The backend enforces all critical business invariants (RBAC, escrow arithmetic, idempotent payments), while the frontend implements role-aware workflows and Stitch-driven UI parity.

**Tech Stack:** Python 3.12, Django 6, DRF, SimpleJWT, PostgreSQL, Stripe, pytest, React 19, TypeScript, Vite, Tailwind CSS, Axios, Zod, Vitest, Playwright.

---

### Task 1: Scaffold repository baseline

**Files:**
- Create: `backend/` project scaffold
- Create: `frontend/` project scaffold
- Create: `.env.example`, `README.md`, `.gitignore`

**Step 1: Write the failing test**
```python
# backend/tests/test_health.py
import requests

def test_health_endpoint_returns_ok():
    assert requests.get("http://localhost:8000/api/health/").status_code == 200
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/test_health.py -v`  
Expected: FAIL (server/route missing)

**Step 3: Write minimal implementation**
- Create Django project + `api/health/` endpoint.
- Create frontend Vite app bootstrapped with TypeScript.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/test_health.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend frontend .env.example README.md .gitignore
git commit -m "chore: scaffold backend frontend baseline"
```

### Task 2: Implement auth and role model

**Files:**
- Create: `backend/accounts/models.py`
- Create: `backend/accounts/serializers.py`
- Create: `backend/accounts/views.py`
- Create: `backend/accounts/urls.py`
- Test: `backend/tests/accounts/test_auth_roles.py`

**Step 1: Write the failing test**
```python
def test_user_registers_with_entrepreneur_role(api_client):
    resp = api_client.post("/api/auth/register/", {"email":"e@x.com","password":"StrongPass123!","role":"entrepreneur"}, format="json")
    assert resp.status_code == 201
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/accounts/test_auth_roles.py::test_user_registers_with_entrepreneur_role -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Custom user model with role enum.
- Register, token, me-get, me-patch endpoints.
- Block self-registration as admin.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/accounts/test_auth_roles.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/accounts backend/tests/accounts
git commit -m "feat: add JWT auth and role model"
```

### Task 3: Proposal lifecycle engine

**Files:**
- Create: `backend/marketplace/models.py`
- Create: `backend/marketplace/serializers.py`
- Create: `backend/marketplace/views.py`
- Test: `backend/tests/marketplace/test_proposals.py`

**Step 1: Write the failing test**
```python
def test_investor_only_sees_approved_proposals(authenticated_investor_client, approved_and_pending_proposals):
    resp = authenticated_investor_client.get("/api/proposals/")
    assert all(item["status"] == "approved" for item in resp.data["data"])
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/marketplace/test_proposals.py::test_investor_only_sees_approved_proposals -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Proposal model + list filters by role.
- create, approve, set_milestone flows.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/marketplace/test_proposals.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/marketplace backend/tests/marketplace
git commit -m "feat: implement proposal lifecycle"
```

### Task 4: Investor signals with dedupe + accept transition

**Files:**
- Modify: `backend/marketplace/models.py`
- Modify: `backend/marketplace/views.py`
- Test: `backend/tests/marketplace/test_signals.py`

**Step 1: Write the failing test**
```python
def test_duplicate_pending_signal_rejected(investor_client, approved_proposal):
    payload = {"proposal": approved_proposal.id, "signal_type": "interest"}
    assert investor_client.post("/api/signals/", payload, format="json").status_code == 201
    assert investor_client.post("/api/signals/", payload, format="json").status_code == 400
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/marketplace/test_signals.py::test_duplicate_pending_signal_rejected -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Signal create rule enforcement.
- Accept/reject patch endpoint.
- On accepted, ensure chat room exists.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/marketplace/test_signals.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/marketplace backend/tests/marketplace/test_signals.py
git commit -m "feat: add investor signal workflow"
```

### Task 5: Escrow ledger and constraints

**Files:**
- Modify: `backend/marketplace/models.py`
- Modify: `backend/marketplace/views.py`
- Test: `backend/tests/marketplace/test_escrow_rules.py`

**Step 1: Write the failing test**
```python
def test_admin_cannot_release_beyond_current_escrow(admin_client, seeded_escrow_state):
    resp = admin_client.post("/api/transactions/", {"action":"release","proposal":seeded_escrow_state.proposal.id,"amount":"999999"}, format="json")
    assert resp.status_code == 400
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/marketplace/test_escrow_rules.py::test_admin_cannot_release_beyond_current_escrow -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- WalletTransaction model and create rules.
- wallet/balance and escrow-summary endpoints.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/marketplace/test_escrow_rules.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/marketplace backend/tests/marketplace/test_escrow_rules.py
git commit -m "feat: enforce escrow ledger constraints"
```

### Task 6: Messaging and unread state

**Files:**
- Create: `backend/messaging/models.py`
- Create: `backend/messaging/views.py`
- Create: `backend/messaging/urls.py`
- Test: `backend/tests/messaging/test_chat_permissions.py`

**Step 1: Write the failing test**
```python
def test_non_participant_cannot_read_chat_thread(non_participant_client, proposal):
    resp = non_participant_client.get(f"/api/messages/proposal/{proposal.id}/")
    assert resp.status_code in (403, 404)
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/messaging/test_chat_permissions.py::test_non_participant_cannot_read_chat_thread -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- ChatRoom, Message, MessageNotification models.
- send, thread list, read, unread count, chats list endpoints.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/messaging/test_chat_permissions.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/messaging backend/tests/messaging
git commit -m "feat: implement chat and unread notifications"
```

### Task 7: Stripe payment intent + webhook sync

**Files:**
- Create: `backend/payments/models.py`
- Create: `backend/payments/views.py`
- Create: `backend/payments/urls.py`
- Test: `backend/tests/payments/test_webhook_idempotency.py`

**Step 1: Write the failing test**
```python
def test_repeated_webhook_event_is_idempotent(payment_webhook_client, stripe_succeeded_event):
    first = payment_webhook_client.post("/api/payments/webhook/", stripe_succeeded_event, content_type="application/json")
    second = payment_webhook_client.post("/api/payments/webhook/", stripe_succeeded_event, content_type="application/json")
    assert first.status_code == 200
    assert second.status_code == 200
```

**Step 2: Run test to verify it fails**
Run: `pytest backend/tests/payments/test_webhook_idempotency.py -v`  
Expected: FAIL

**Step 3: Write minimal implementation**
- PaymentAttempt model.
- create-intent and status endpoints.
- webhook signature validation + idempotent ledger write.

**Step 4: Run test to verify it passes**
Run: `pytest backend/tests/payments/test_webhook_idempotency.py -v`  
Expected: PASS

**Step 5: Commit**
```bash
git add backend/payments backend/tests/payments
git commit -m "feat: add stripe payment lifecycle and webhook sync"
```

### Task 8: Stitch-first UI baseline and design system

**Files:**
- Create: `docs/stitch/screens-index.md`
- Create: `frontend/src/design/tokens.ts`
- Modify: `frontend/src/index.css`

**Step 1: Write the failing test**
```ts
import { describe, expect, it } from 'vitest'
import { tokens } from '@/design/tokens'

describe('design tokens', () => {
  it('includes primary color scale', () => {
    expect(tokens.colors.primary).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**
Run: `npm run test -- src/design/tokens.test.ts`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Create Stitch project and screen drafts.
- Export token mapping.
- Implement simple/sleek visual primitives.

**Step 4: Run test to verify it passes**
Run: `npm run test -- src/design/tokens.test.ts`  
Expected: PASS

**Step 5: Commit**
```bash
git add docs/stitch frontend/src/design frontend/src/index.css
git commit -m "feat: apply stitch-led design tokens and baseline"
```

### Task 9: Frontend page workflows

**Files:**
- Create: `frontend/src/pages/*`
- Create: `frontend/src/components/*`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/validation.ts`
- Test: `frontend/src/__tests__/role-flows.test.tsx`

**Step 1: Write the failing test**
```tsx
it('routes investor to proposals and wallet flow', async () => {
  // render app with investor session and assert nav/path behavior
})
```

**Step 2: Run test to verify it fails**
Run: `npm run test -- src/__tests__/role-flows.test.tsx`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Build pages and role-aware navigation.
- Hook forms/actions to backend APIs.

**Step 4: Run test to verify it passes**
Run: `npm run test -- src/__tests__/role-flows.test.tsx`  
Expected: PASS

**Step 5: Commit**
```bash
git add frontend/src
git commit -m "feat: implement role-based frontend workflows"
```

### Task 10: End-to-end verification and hardening

**Files:**
- Create: `frontend/e2e/happy-path.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `docker-compose.yml`

**Step 1: Write the failing test**
```ts
test('happy path: entrepreneur -> admin -> investor -> escrow settlement', async ({ page }) => {
  // orchestrate complete cross-role flow
})
```

**Step 2: Run test to verify it fails**
Run: `npm run e2e -- frontend/e2e/happy-path.spec.ts`  
Expected: FAIL

**Step 3: Write minimal implementation**
- Complete missing flow edges.
- Add CI checks and local orchestration.

**Step 4: Run test to verify it passes**
Run: `npm run e2e -- frontend/e2e/happy-path.spec.ts`  
Expected: PASS

**Step 5: Commit**
```bash
git add frontend/e2e .github/workflows/ci.yml docker-compose.yml
git commit -m "chore: verify end-to-end and add CI pipeline"
```
