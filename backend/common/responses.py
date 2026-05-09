from rest_framework.response import Response


def list_envelope(data, count=None, next_url=None, previous_url=None):
    total = len(data) if count is None else count
    return Response({
        "data": data,
        "count": total,
        "next": next_url,
        "previous": previous_url,
    })
