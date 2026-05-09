# Screen / Tab / Button Functionality Map

This is the UI control inventory for `new project/src/App.tsx` and child components.

---

## 1) Global shell controls

## Top bar
- **Signup / Login** (visible when logged out)
  - Action: `setPage('auth')`
- **Logout** (visible when logged in)
  - Action: clear current user + chat context, return landing
- **API status pill**
  - States: Checking API / API Online / API Offline

## Main navigation (logged-in users)
- `Landing`
- `Profile`
- `Dashboard`
- `Proposals`
- `Virtual Escrow Wallet`
- `Chat`
- For admin role: `Admin Panel`, `Landing`

Behavior:
- Opening Chat from nav auto-enables one-thread auto-open mode.
- Opening Dashboard resets entrepreneur dashboard section to `overview`.

---

## 2) Landing page

Buttons:
1. **Join as Entrepreneur**
   - Sets auth role entrepreneur
   - Navigates to auth page
2. **Join as Investor**
   - Sets auth role investor
   - Navigates to auth page

Informational panels:
- Founder workflow
- Investor workflow
- Capital security layer

---

## 3) Auth page

Controls:
- Role switch buttons:
  - Entrepreneur
  - Investor
- Access mode switch buttons:
  - Create Account
  - Sign In

Form fields:
- signup: name + email + password
- login: email + password

Primary button:
- **Continue to Workspace**
  - signup -> register then login
  - login -> token + current user fetch
  - routing:
    - admin -> Admin page
    - signup non-admin -> Profile page
    - login non-admin -> Dashboard

Demo autofill buttons:
- **Use Admin Demo Credentials**
- **Use Entrepreneur Demo**
- **Use Investor Demo**

---

## 4) Profile page (non-admin)

Status pills:
- Verification pill (`Verified` / `Pending Verification`)
- Account status pill (`Active` / `Frozen`)

Role-specific editable fields:
- Entrepreneur:
  - Business Idea
  - Funding Required
  - Startup Documents
- Investor:
  - Investment Interest
  - Budget Range

Button:
- **Save Profile**
  - Updates local frontend user state
  - (current implementation does not call `/api/auth/me/patch` from this form)

---

## 5) Dashboard page

## Shared dashboard top nav
- Dashboard (active)
- Submit/Browse (routes to proposals)
- Wallet
- Messages
- Sign Out

## Entrepreneur dashboard

### Section tabs
- **Overview**
- **My Proposals**

### Overview buttons
- **Submit Proposal** -> Proposals page
- **View My Proposals** -> switches section tab

### Milestone controls
- Per-proposal milestone dropdown:
  - Not Started
  - In Progress
  - Completed
  - Triggers `updateMilestone` and backend milestone endpoint.

### Investor Requests card buttons
For each incoming signal:
- **Accept**
- **Reject**

### My Proposals section buttons
- **Submit Another Proposal** -> Proposals page
- **Back to Overview** -> overview section

## Investor dashboard

Buttons:
- **Browse Proposals** -> Proposals page
- **Open Virtual Escrow** -> Wallet page

Filter controls:
- Category select
- Max Budget input

Request summary section:
- list of sent signal statuses

---

## 6) Proposals page

## Investor view controls
- Filters row:
  - Category select
  - Max budget input
- Message Founder input (used as signal message body)

Per proposal card buttons:
1. **Interested / Interest Sent / Open Chat**
   - Creates or reuses signal/chat context
2. **Invest**
   - Preselects proposal in wallet and routes to wallet page
   - Disabled unless proposal status approved

## Entrepreneur view controls
Proposal form fields:
- Business Title
- Startup Details
- Pitch Description
- Category
- Required Funding
- Timeline
- Documents filename
- Pitch Video URL

Button:
- **Submit Proposal**

---

## 7) Wallet page

## Investor wallet

Stats cards:
- Available Capital
- In Escrow
- Your Transactions
- Account Status

Form controls:
- Payment Method select
  - Escrow Wallet (virtual)
  - Stripe Card Payment (realtime)
- Select Proposal
- Investment Amount

Buttons / behavior:
- **Hold in Escrow** (only when method is non-stripe)
- Stripe mode renders card checkout component with button:
  - **Pay X USD via Stripe**

Transaction table shows historical transactions.

## Entrepreneur wallet

Read-only monitoring view:
- Funds released to entrepreneur
- Escrow on entrepreneur proposals
- Incoming requests count
- Proposal escrow cards
- Entrepreneur transaction table

No payment initiation controls.

---

## 8) Chat page

## Chat list screen (`ChatListPage`)
Buttons:
- **Refresh** chat list
- Per-chat row button to open selected chat

Auto behavior:
- If auto-open enabled and exactly one chat exists, opens directly.

## Chat window (`ChatWindow`)
Buttons/controls:
- **Back**
- Message input + **Send**
- Polling toggle checkbox (**Enable polling (3s intervals)**)

Message states:
- Own messages vs other participant messages styled differently
- Read status updated for incoming messages

---

## 9) Admin page

## User Management
Per user buttons:
- **Verify / Unverify**
- **Freeze / Unfreeze**

## Proposal Moderation
Per proposal buttons:
- **Approve**
- **Pending**

## Dispute Resolution card
Buttons:
- **Release**
- **Refund**

## Escrow Management form
Controls:
- proposal select
- amount input
Buttons:
- **Release**
- **Refund**

Error surfacing:
- wallet error text displayed below form.

---

## 10) UI-to-backend intent notes
- Some controls call backend APIs directly (proposals/signals/transactions/chat/payments).
- Some admin/profile toggles are currently frontend-state-only convenience behavior.
- For production-grade replication, convert all moderation/profile mutations to explicit backend endpoints with audit logs.
