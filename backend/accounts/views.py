import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.http import FileResponse
from rest_framework import generics, permissions, status

logger = logging.getLogger(__name__)
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from .models import EmailVerificationCode, EntrepreneurVerification, User

from .serializers import (
	AdminVerificationReviewSerializer,
	EntrepreneurVerificationSerializer,
	RegisterSerializer,
	UserSerializer,
	UserUpdateSerializer,
)


VERIFICATION_FILE_FIELDS = {"identity_front", "identity_back", "passport_photo", "proof_video_file", "bank_statement"}


class RegisterView(generics.CreateAPIView):
	queryset = User.objects.all()
	serializer_class = RegisterSerializer
	permission_classes = [permissions.AllowAny]

	def create(self, request, *args, **kwargs):
		# Save raw password before hashing so we can include in welcome email
		raw_password = request.data.get("password", "")
		response = super().create(request, *args, **kwargs)
		# Send welcome email
		email = request.data.get("email", "")
		first_name = request.data.get("first_name", "") or "there"
		role = request.data.get("role", "investor").capitalize()
		if email:
			try:
				welcome_html = f"""
				<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
				  <div style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);padding:32px 24px;text-align:center">
					<h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px">VentureLedger</h1>
					<p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px">Your investment platform</p>
				  </div>
				  <div style="padding:32px 28px">
					<h2 style="margin:0 0 8px;color:#111827;font-size:20px">Welcome, {first_name}! 👋</h2>
					<p style="color:#6b7280;margin:0 0 24px;font-size:15px">Your <strong>{role}</strong> account has been created. Here are your login credentials:</p>
					<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
					  <table style="width:100%;border-collapse:collapse">
						<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:90px">Email</td><td style="padding:6px 0;color:#111827;font-weight:600;font-size:14px">{email}</td></tr>
						<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Password</td><td style="padding:6px 0;color:#111827;font-weight:600;font-size:14px;font-family:monospace">{raw_password}</td></tr>
						<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Role</td><td style="padding:6px 0;color:#111827;font-weight:600;font-size:14px">{role}</td></tr>
					  </table>
					</div>
					<p style="color:#6b7280;font-size:13px;margin:0">Next step: verify your email address with the OTP code, then complete your KYC profile to access the platform.</p>
				  </div>
				  <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;text-align:center">
					<p style="color:#9ca3af;font-size:12px;margin:0">&copy; 2025 VentureLedger. All rights reserved.</p>
				  </div>
				</div>
				"""
				send_mail(
					subject="Welcome to VentureLedger!",
					message=f"Welcome to VentureLedger, {first_name}! Your {role} account is ready. Email: {email}",
					from_email=settings.DEFAULT_FROM_EMAIL,
					recipient_list=[email],
					html_message=welcome_html,
					fail_silently=False,
				)
			except Exception as e:
				logger.error("[Email] Welcome email failed for %s: %s", email, e)
		return response


class MeView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		return Response(UserSerializer(request.user, context={"request": request}).data)

	def patch(self, request):
		serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(UserSerializer(request.user, context={"request": request}).data)


class VerificationView(APIView):
	permission_classes = [permissions.IsAuthenticated]
	parser_classes = [MultiPartParser, FormParser, JSONParser]

	def get_object(self, user):
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=user)
		return verification

	def get(self, request):
		if request.user.role == User.Roles.ADMIN:
			return Response({"detail": "Admins do not have a verification profile."}, status=403)
		return Response(EntrepreneurVerificationSerializer(self.get_object(request.user), context={"request": request}).data)

	def patch(self, request):
		if request.user.role == User.Roles.ADMIN:
			return Response({"detail": "Admins cannot submit verification details."}, status=403)

		verification = self.get_object(request.user)
		serializer = EntrepreneurVerificationSerializer(
			verification,
			data=request.data,
			partial=True,
			context={"request": request},
		)
		serializer.is_valid(raise_exception=True)
		verification = serializer.save()

		should_submit = str(request.data.get("submit", "")).lower() in {"1", "true", "yes", "on"}
		if should_submit:
			verification.status = EntrepreneurVerification.Status.SUBMITTED
			verification.submitted_at = timezone.now()
			verification.admin_message = ""
			verification.save(update_fields=["status", "submitted_at", "admin_message", "updated_at"])

		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)


class AdminUsersView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		users = User.objects.select_related('verification_profile').all().order_by("-date_joined")
		return Response(
			{
				"data": UserSerializer(users, many=True, context={"request": request}).data,
				"count": users.count(),
				"next": None,
				"previous": None,
			}
		)


class AdminUserDetailView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		target = get_object_or_404(User, pk=user_id)
		return Response(UserSerializer(target, context={"request": request}).data)

	def patch(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)

		target = get_object_or_404(User, pk=user_id)
		for field in ["verified", "frozen"]:
			if field in request.data:
				setattr(target, field, bool(request.data[field]))
		target.save(update_fields=["verified", "frozen"])
		return Response(UserSerializer(target, context={"request": request}).data)

	def delete(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		if request.user.id == user_id:
			return Response({"detail": "Admins cannot delete their own account from this endpoint."}, status=400)

		target = get_object_or_404(User, pk=user_id)
		from marketplace.models import InvestmentAgreement, Proposal, WalletTransaction
		from payments.models import PaymentAttempt

		linked_financial_activity = (
			WalletTransaction.objects.filter(investor=target).exists()
			or WalletTransaction.objects.filter(entrepreneur=target).exists()
			or WalletTransaction.objects.filter(processed_by=target).exists()
			or PaymentAttempt.objects.filter(investor=target).exists()
			or InvestmentAgreement.objects.filter(investor=target).exists()
			or InvestmentAgreement.objects.filter(entrepreneur=target).exists()
			or Proposal.objects.filter(entrepreneur=target, transactions__isnull=False).exists()
			or Proposal.objects.filter(entrepreneur=target, payment_attempts__isnull=False).exists()
			or Proposal.objects.filter(entrepreneur=target, agreements__isnull=False).exists()
		)
		if linked_financial_activity:
			return Response({"detail": "Cannot hard-delete users with proposal, payment, agreement, or escrow activity. Freeze/deactivate instead."}, status=400)
		for proposal in list(Proposal.objects.filter(entrepreneur=target)):
			proposal.delete()
		target.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


class AdminUserVerificationView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		target = get_object_or_404(User, pk=user_id)
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=target)
		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)

	def patch(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)

		target = get_object_or_404(User, pk=user_id)
		verification, _ = EntrepreneurVerification.objects.get_or_create(user=target)
		serializer = AdminVerificationReviewSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		decision = serializer.validated_data["status"]
		verification.status = decision
		verification.admin_message = serializer.validated_data.get("admin_message", "")
		verification.reviewed_by = request.user
		verification.reviewed_at = timezone.now()
		verification.save(update_fields=["status", "admin_message", "reviewed_by", "reviewed_at", "updated_at"])

		target.verified = decision == EntrepreneurVerification.Status.APPROVED
		target.save(update_fields=["verified"])

		return Response(EntrepreneurVerificationSerializer(verification, context={"request": request}).data)


class VerificationFileDownloadView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request, user_id: int, field_name: str):
		if field_name not in VERIFICATION_FILE_FIELDS:
			raise ValidationError("Unsupported verification file field.")
		target = get_object_or_404(User, pk=user_id)
		if request.user.role != User.Roles.ADMIN and request.user.id != target.id:
			return Response({"detail": "Forbidden"}, status=403)
		verification = get_object_or_404(EntrepreneurVerification, user=target)
		stored_file = getattr(verification, field_name)
		if not stored_file:
			return Response({"detail": "File not found."}, status=404)
		response = FileResponse(stored_file.open("rb"), as_attachment=True, filename=stored_file.name.rsplit("/", 1)[-1])
		response["X-Content-Type-Options"] = "nosniff"
		return response


class DemoCredentialsView(APIView):
	permission_classes = [permissions.AllowAny]

	def get(self, request):
		"""Return demo credentials for testing (development only)."""
		return Response({
			"demo_users": [
				{
					"role": "admin",
					"email": "admin@demo.local",
					"password": "DemoPass123!",
				},
				{
					"role": "entrepreneur",
					"email": "entrepreneur@demo.local",
					"password": "DemoPass123!",
				},
				{
					"role": "investor",
					"email": "investor@demo.local",
					"password": "Investor@123",
				},
			],
			"note": "Demo credentials for testing purposes only",
		})


class RequestEmailCodeView(APIView):
	"""Generate and return a 6-digit email verification code for the authenticated user."""
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request):
		import random

		code = str(random.randint(100000, 999999))
		EmailVerificationCode.objects.update_or_create(
			user=request.user,
			defaults={"code": code, "verified": False},
		)

		# Send OTP via Gmail SMTP
		try:
			name = request.user.first_name or request.user.email
			otp_html = f"""
			<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
			  <div style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);padding:28px 24px;text-align:center">
				<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700">VentureLedger</h1>
			  </div>
			  <div style="padding:32px 28px;text-align:center">
				<h2 style="margin:0 0 8px;color:#111827;font-size:20px">Your Verification Code</h2>
				<p style="color:#6b7280;margin:0 0 28px;font-size:15px">Hello {name}, enter this code to verify your email address.</p>
				<div style="background:#f0f4ff;border:2px dashed #6366f1;border-radius:12px;padding:24px;margin-bottom:24px;display:inline-block;min-width:220px">
				  <span style="font-size:36px;font-weight:800;letter-spacing:0.35em;color:#1d4ed8;font-family:monospace">{code}</span>
				</div>
				<p style="color:#9ca3af;font-size:13px;margin:0">This code expires when you request a new one. Do not share it with anyone.</p>
			  </div>
			  <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #e5e7eb;text-align:center">
				<p style="color:#9ca3af;font-size:12px;margin:0">&copy; 2025 VentureLedger. All rights reserved.</p>
			  </div>
			</div>
			"""
			send_mail(
				subject="VentureLedger — Your Verification Code",
				message=f"Hello {name}, your VentureLedger verification code is: {code}",
				from_email=settings.DEFAULT_FROM_EMAIL,
				recipient_list=[request.user.email],
				html_message=otp_html,
				fail_silently=False,
			)
		except Exception as e:
			logger.error("[Email] OTP email failed for %s: %s", request.user.email, e)

		response_data: dict = {"detail": "Verification code sent to your email."}
		return Response(response_data)


class VerifyEmailCodeView(APIView):
	"""Verify the 6-digit code submitted by the user."""
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request):
		submitted_code = str(request.data.get("code", "")).strip()
		if not submitted_code:
			return Response({"detail": "Code is required."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			ev = EmailVerificationCode.objects.get(user=request.user)
		except EmailVerificationCode.DoesNotExist:
			return Response({"detail": "No code found. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)

		if ev.verified:
			return Response({"detail": "Email already verified."})

		if ev.code != submitted_code:
			return Response({"detail": "Invalid code. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

		ev.verified = True
		ev.save(update_fields=["verified"])
		return Response({"detail": "Email verified successfully."})
