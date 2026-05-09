from django.urls import path

from .views import AdminUserDetailView, AdminUsersView, MeView, RegisterView, DemoCredentialsView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("demo-credentials/", DemoCredentialsView.as_view(), name="demo-credentials"),
    path("users/", AdminUsersView.as_view(), name="admin-users"),
    path("users/<int:user_id>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
]
