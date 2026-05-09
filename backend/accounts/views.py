from rest_framework import generics, permissions
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import RegisterSerializer, UserSerializer, UserUpdateSerializer


class RegisterView(generics.CreateAPIView):
	queryset = User.objects.all()
	serializer_class = RegisterSerializer
	permission_classes = [permissions.AllowAny]


class MeView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		return Response(UserSerializer(request.user).data)

	def patch(self, request):
		serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(UserSerializer(request.user).data)


class AdminUsersView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)
		users = User.objects.all().order_by("-date_joined")
		return Response(
			{
				"data": UserSerializer(users, many=True).data,
				"count": users.count(),
				"next": None,
				"previous": None,
			}
		)


class AdminUserDetailView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def patch(self, request, user_id: int):
		if request.user.role != User.Roles.ADMIN:
			return Response({"detail": "Forbidden"}, status=403)

		target = get_object_or_404(User, pk=user_id)
		for field in ["verified", "frozen"]:
			if field in request.data:
				setattr(target, field, bool(request.data[field]))
		target.save(update_fields=["verified", "frozen"])
		return Response(UserSerializer(target).data)


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
					"password": "DemoPass123!",
				},
			],
			"note": "Demo credentials for testing purposes only",
		})
