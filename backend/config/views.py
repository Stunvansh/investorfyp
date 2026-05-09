from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt


@csrf_exempt
@require_GET
def health_check(request):
    """Health check endpoint - no auth required, allows CORS preflight."""
    response = JsonResponse({"status": "ok", "service": "ventureledger-backend"})
    
    # Explicitly set CORS headers for development
    origin = request.META.get("HTTP_ORIGIN", "")
    if origin:
        # Allow any localhost/127.0.0.1 origin in dev
        if "localhost" in origin or "127.0.0.1" in origin:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, OPTIONS, HEAD"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response["Access-Control-Max-Age"] = "3600"
    
    return response
