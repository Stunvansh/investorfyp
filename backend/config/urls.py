from django.contrib import admin
from django.urls import include, path
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .views import health_check


@csrf_exempt
def cors_preflight(request):
    """Generic CORS preflight handler for localhost development."""
    if request.method == "OPTIONS":
        response = HttpResponse()
        origin = request.META.get("HTTP_ORIGIN", "")
        if origin and ("localhost" in origin or "127.0.0.1" in origin):
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response["Access-Control-Max-Age"] = "3600"
        return response
    return HttpResponse(status=405)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/", include("config.api_urls")),
]
