# InvestorFYP — VentureLedger Exchange

A production-oriented entrepreneur–investor collaboration platform with:
- Role-based auth (entrepreneur, investor, admin)
- Proposal lifecycle + moderation
- Investor signaling + chat
- Escrow ledger transactions
- Stripe payment intent flow + webhook sync
- Admin controls for settlement and user flags

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Django + DRF + JWT
- Database: PostgreSQL baseline (with SQLite fallback for local boot)
- Payments: Stripe

## Quick Start

### 1) Backend
```powershell
Set-Location e:\investorfyp\backend
Copy-Item .env.example .env
c:/python313/python.exe -m pip install -r requirements.txt
c:/python313/python.exe manage.py migrate
c:/python313/python.exe manage.py createsuperuser
c:/python313/python.exe manage.py seed_demo_users
c:/python313/python.exe manage.py runserver
```

### 2) Frontend
```powershell
Set-Location e:\investorfyp\frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`  
Backend URL: `http://127.0.0.1:8000`

## API Root
`http://127.0.0.1:8000/api`

## Demo Credentials
After running `python manage.py seed_demo_users`:

- Admin: `admin@demo.local` / `DemoPass123!`
- Entrepreneur: `entrepreneur@demo.local` / `DemoPass123!`
- Investor: `investor@demo.local` / `DemoPass123!`

The login screen includes one-click demo auto-fill buttons for all three accounts.

## Design Assets (Stitch)
See `docs/stitch/screens-index.md` for generated screen IDs and mapping.

## Quality Checks
```powershell
# backend
Set-Location e:\investorfyp\backend
c:/python313/python.exe manage.py check

# frontend
Set-Location e:\investorfyp\frontend
npm run build
```
