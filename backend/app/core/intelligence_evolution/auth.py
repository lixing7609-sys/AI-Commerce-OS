import base64
import json
import time

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import load_cloud_dependencies


bearer = HTTPBearer(auto_error=False)


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_cloud_iam_token(token: str, *, now: int | None = None) -> dict:
    dependencies = load_cloud_dependencies()
    if not dependencies.iam_public_key or not dependencies.iam_issuer or not dependencies.iam_audience:
        raise HTTPException(status_code=503, detail="Cloud IAM is not configured")
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        header = json.loads(_decode(encoded_header))
        claims = json.loads(_decode(encoded_payload))
        if header.get("alg") != "RS256":
            raise ValueError("Unsupported algorithm")
        public_key = serialization.load_pem_public_key(dependencies.iam_public_key.encode())
        public_key.verify(_decode(encoded_signature), f"{encoded_header}.{encoded_payload}".encode(), padding.PKCS1v15(), hashes.SHA256())
        current = int(now if now is not None else time.time())
        audience = claims.get("aud")
        audiences = audience if isinstance(audience, list) else [audience]
        if claims.get("iss") != dependencies.iam_issuer or dependencies.iam_audience not in audiences or int(claims.get("exp", 0)) <= current:
            raise ValueError("Invalid claims")
    except Exception as error:
        raise HTTPException(status_code=401, detail="Invalid Cloud IAM token") from error
    return claims


def require_roles(*allowed: str):
    def dependency(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Bearer token required")
        claims = verify_cloud_iam_token(credentials.credentials)
        roles = claims.get("roles") or [claims.get("role")]
        if isinstance(roles, str):
            roles = [roles]
        if not set(allowed).intersection(filter(None, roles)):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return claims
    return dependency
