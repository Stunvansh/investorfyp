from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from marketplace.models import Proposal, WalletTransaction


class SystemSmokeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def auth_client(self, email: str, password: str) -> APIClient:
        c = APIClient()
        token_resp = c.post("/api/auth/token/", {"email": email, "password": password}, format="json")
        self.assertEqual(token_resp.status_code, 200)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token_resp.data['access']}")
        return c

    def test_health(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)

    def test_role_and_proposal_signal_flow(self):
        entrepreneur = User.objects.create_user(email="founder@test.com", password="Pass12345!", role="entrepreneur")
        investor = User.objects.create_user(email="investor@test.com", password="Pass12345!", role="investor")
        admin = User.objects.create_user(email="admin@test.com", password="Pass12345!", role="admin")

        founder_client = self.auth_client(entrepreneur.email, "Pass12345!")
        investor_client = self.auth_client(investor.email, "Pass12345!")
        admin_client = self.auth_client(admin.email, "Pass12345!")

        proposal_resp = founder_client.post(
            "/api/proposals/",
            {
                "title": "Agri AI",
                "startup_details": "AI for crop analytics",
                "description": "Predictive insights",
                "category": "AgriTech",
                "required_funding": "50000",
                "timeline": "6 months",
                "document_name": "deck.pdf",
                "pitch_video_url": "https://example.com/pitch",
            },
            format="json",
        )
        self.assertEqual(proposal_resp.status_code, 201)
        proposal_id = proposal_resp.data["id"]

        approve_resp = admin_client.post(f"/api/proposals/{proposal_id}/approve/")
        self.assertEqual(approve_resp.status_code, 200)
        self.assertEqual(approve_resp.data["status"], "approved")

        signal_resp = investor_client.post(
            "/api/signals/",
            {"proposal": proposal_id, "signal_type": "interest", "message": "Interested"},
            format="json",
        )
        self.assertEqual(signal_resp.status_code, 201)

        signal_id = signal_resp.data["id"]
        accept_resp = founder_client.patch(f"/api/signals/{signal_id}/", {"status": "accepted"}, format="json")
        self.assertEqual(accept_resp.status_code, 200)
        self.assertEqual(accept_resp.data["status"], "accepted")

        agreement_resp = investor_client.post(
            "/api/agreements/",
            {
                "proposal": proposal_id,
                "amount": "1000",
                "payment_method": "virtual-escrow",
                "equity_percentage": "5.00",
                "profit_share_percentage": "10.00",
                "expected_return_note": "Profit share after milestone completion",
                "term_months": 12,
                "accepted_name": "Investor Demo",
            },
            format="json",
        )
        self.assertEqual(agreement_resp.status_code, 201)
        self.assertTrue(agreement_resp.data["accepted"])

        invest_resp = investor_client.post(
            "/api/transactions/",
            {
                "proposal": proposal_id,
                "amount": "1000",
                "action": "invest",
                "method": "virtual-escrow",
                "notes": "initial escrow",
            },
            format="json",
        )
        self.assertEqual(invest_resp.status_code, 201)
        self.assertEqual(invest_resp.data["action"], "invest")

    def test_entrepreneur_verification_review_and_user_delete(self):
        entrepreneur = User.objects.create_user(email="kyc-founder@test.com", password="Pass12345!", role="entrepreneur")
        admin = User.objects.create_user(email="kyc-admin@test.com", password="Pass12345!", role="admin")

        founder_client = self.auth_client(entrepreneur.email, "Pass12345!")
        admin_client = self.auth_client(admin.email, "Pass12345!")

        submit_resp = founder_client.patch(
            "/api/auth/verification/",
            {
                "phone_number": "+923001112233",
                "address": "House 12, Startup Road, Lahore",
                "identity_type": "cnic",
                "identity_number": "35202-1234567-1",
                "startup_website_url": "https://startup.example.com",
                "proof_video_url": "https://example.com/demo-video",
                "linkedin_url": "https://linkedin.com/company/startup",
                "submit": True,
            },
            format="json",
        )
        self.assertEqual(submit_resp.status_code, 200)
        self.assertEqual(submit_resp.data["status"], "submitted")

        review_resp = admin_client.patch(
            f"/api/auth/users/{entrepreneur.id}/verification/",
            {"status": "approved", "admin_message": "Identity and startup proof verified."},
            format="json",
        )
        self.assertEqual(review_resp.status_code, 200)
        self.assertEqual(review_resp.data["status"], "approved")
        entrepreneur.refresh_from_db()
        self.assertTrue(entrepreneur.verified)

        reject_resp = admin_client.patch(
            f"/api/auth/users/{entrepreneur.id}/verification/",
            {"status": "rejected", "admin_message": "CNIC back image is missing."},
            format="json",
        )
        self.assertEqual(reject_resp.status_code, 200)
        self.assertEqual(reject_resp.data["status"], "rejected")
        self.assertEqual(reject_resp.data["admin_message"], "CNIC back image is missing.")
        entrepreneur.refresh_from_db()
        self.assertFalse(entrepreneur.verified)

        disposable = User.objects.create_user(email="delete-me@test.com", password="Pass12345!", role="investor")
        delete_resp = admin_client.delete(f"/api/auth/users/{disposable.id}/")
        self.assertEqual(delete_resp.status_code, 204)
        self.assertFalse(User.objects.filter(pk=disposable.id).exists())

    def test_proposal_review_rich_detail_and_safe_delete(self):
        entrepreneur = User.objects.create_user(email="proposal-founder@test.com", password="Pass12345!", role="entrepreneur", verified=True)
        investor = User.objects.create_user(email="proposal-investor@test.com", password="Pass12345!", role="investor", verified=True)
        admin = User.objects.create_user(email="proposal-admin@test.com", password="Pass12345!", role="admin")

        founder_client = self.auth_client(entrepreneur.email, "Pass12345!")
        investor_client = self.auth_client(investor.email, "Pass12345!")
        admin_client = self.auth_client(admin.email, "Pass12345!")

        proposal_resp = founder_client.post(
            "/api/proposals/",
            {
                "title": "Proof Rich Startup",
                "startup_details": "Working marketplace with traction",
                "description": "Detailed proof-backed pitch",
                "category": "MarketTech",
                "required_funding": "25000",
                "timeline": "9 months",
                "document_name": "proof-deck.pdf",
                "pitch_video_url": "https://example.com/pitch",
                "startup_website_url": "https://proof-startup.example.com",
                "proof_video_url": "https://example.com/system-proof",
            },
            format="json",
        )
        self.assertEqual(proposal_resp.status_code, 201)
        proposal_id = proposal_resp.data["id"]

        reject_resp = admin_client.patch(
            f"/api/proposals/{proposal_id}/",
            {"status": "rejected", "admin_message": "Financial proof needs more detail."},
            format="json",
        )
        self.assertEqual(reject_resp.status_code, 200)
        self.assertEqual(reject_resp.data["status"], "rejected")
        self.assertEqual(reject_resp.data["admin_message"], "Financial proof needs more detail.")

        approve_resp = admin_client.post(f"/api/proposals/{proposal_id}/approve/")
        self.assertEqual(approve_resp.status_code, 200)
        detail_resp = investor_client.get(f"/api/proposals/{proposal_id}/")
        self.assertEqual(detail_resp.status_code, 200)
        self.assertEqual(detail_resp.data["startup_website_url"], "https://proof-startup.example.com")
        self.assertEqual(detail_resp.data["proof_video_url"], "https://example.com/system-proof")

        delete_candidate_resp = founder_client.post(
            "/api/proposals/",
            {
                "title": "Delete Candidate",
                "startup_details": "No transactions yet",
                "category": "SaaS",
                "required_funding": "5000",
                "document_name": "delete.pdf",
            },
            format="json",
        )
        self.assertEqual(delete_candidate_resp.status_code, 201)
        delete_resp = founder_client.delete(f"/api/proposals/{delete_candidate_resp.data['id']}/")
        self.assertEqual(delete_resp.status_code, 204)

        agreement_resp = investor_client.post(
            "/api/agreements/",
            {
                "proposal": proposal_id,
                "amount": "1000",
                "payment_method": "virtual-escrow",
                "accepted_name": "Proposal Investor",
            },
            format="json",
        )
        self.assertEqual(agreement_resp.status_code, 201)

        agreement_delete_resp = founder_client.delete(f"/api/proposals/{proposal_id}/")
        self.assertEqual(agreement_delete_resp.status_code, 400)

        invest_resp = investor_client.post(
            "/api/transactions/",
            {"proposal": proposal_id, "amount": "1000", "action": "invest", "method": "virtual-escrow"},
            format="json",
        )
        self.assertEqual(invest_resp.status_code, 201)
        blocked_delete_resp = founder_client.delete(f"/api/proposals/{proposal_id}/")
        self.assertEqual(blocked_delete_resp.status_code, 400)
        blocked_user_delete_resp = admin_client.delete(f"/api/auth/users/{investor.id}/")
        self.assertEqual(blocked_user_delete_resp.status_code, 400)
        self.assertTrue(Proposal.objects.filter(pk=proposal_id).exists())
        self.assertEqual(WalletTransaction.objects.filter(proposal_id=proposal_id).count(), 1)

    def test_investment_requires_accepted_agreement(self):
        entrepreneur = User.objects.create_user(email="agreement-founder@test.com", password="Pass12345!", role="entrepreneur", verified=True)
        investor = User.objects.create_user(email="agreement-investor@test.com", password="Pass12345!", role="investor", verified=True)
        admin = User.objects.create_user(email="agreement-admin@test.com", password="Pass12345!", role="admin")

        founder_client = self.auth_client(entrepreneur.email, "Pass12345!")
        investor_client = self.auth_client(investor.email, "Pass12345!")
        admin_client = self.auth_client(admin.email, "Pass12345!")

        proposal_resp = founder_client.post(
            "/api/proposals/",
            {
                "title": "Agreement Required",
                "startup_details": "Escrow needs terms",
                "category": "FinTech",
                "required_funding": "20000",
                "document_name": "terms.pdf",
            },
            format="json",
        )
        self.assertEqual(proposal_resp.status_code, 201)
        proposal_id = proposal_resp.data["id"]
        self.assertEqual(admin_client.post(f"/api/proposals/{proposal_id}/approve/").status_code, 200)

        blocked_resp = investor_client.post(
            "/api/transactions/",
            {"proposal": proposal_id, "amount": "1500", "action": "invest", "method": "virtual-escrow"},
            format="json",
        )
        self.assertEqual(blocked_resp.status_code, 400)
        self.assertIn("agreement", str(blocked_resp.data).lower())

        agreement_resp = investor_client.post(
            "/api/agreements/",
            {
                "proposal": proposal_id,
                "amount": "1500",
                "payment_method": "virtual-escrow",
                "equity_percentage": "3.50",
                "profit_share_percentage": "8.00",
                "expected_return_note": "Expected return depends on founder performance and escrow milestones.",
                "term_months": 18,
                "accepted_name": "Agreement Investor",
            },
            format="json",
        )
        self.assertEqual(agreement_resp.status_code, 201)
        self.assertTrue(agreement_resp.data["accepted"])
        self.assertIn("Expected return", agreement_resp.data["terms_snapshot"])

        allowed_resp = investor_client.post(
            "/api/transactions/",
            {"proposal": proposal_id, "amount": "1500", "action": "invest", "method": "virtual-escrow"},
            format="json",
        )
        self.assertEqual(allowed_resp.status_code, 201)
