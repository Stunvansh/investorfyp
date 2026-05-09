from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


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
