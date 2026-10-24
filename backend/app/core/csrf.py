from starlette.datastructures import Headers
from starlette.responses import JSONResponse


class TrustedOriginMiddleware:
    """Reject unsafe requests without exactly one explicitly trusted Origin."""

    def __init__(self, app, trusted_origins: list[str]):
        self.app = app
        self.trusted_origins = frozenset(trusted_origins)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}:
            origins = Headers(scope=scope).getlist("origin")
            if len(origins) != 1 or origins[0] not in self.trusted_origins:
                response = JSONResponse(
                    {"detail": "Origin tidak diizinkan."}, status_code=403,
                    headers={"Cache-Control": "no-store"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
