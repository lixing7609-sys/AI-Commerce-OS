import base64
import json
import time

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.intelligence_evolution.api import get_db, router
from app.core.intelligence_evolution.model import CapabilityVersionDB, EvolutionFeedbackDB, UpgradeRequestDB
from app.core.intelligence_evolution.version_repository import register_version


def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def token(private_key, role):
    header = encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = encode(json.dumps({"sub": "actor-1", "iss": "cloud-iam", "aud": "intelligence-evolution", "exp": int(time.time()) + 300, "roles": [role]}).encode())
    signature = private_key.sign(f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{header}.{payload}.{encode(signature)}"


def test_api_auth_roles_and_four_endpoints(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setenv("AI_COMMERCE_CLOUD_IAM_PUBLIC_KEY", public_key)
    monkeypatch.setenv("AI_COMMERCE_CLOUD_IAM_ISSUER", "cloud-iam")
    monkeypatch.setenv("AI_COMMERCE_CLOUD_IAM_AUDIENCE", "intelligence-evolution")
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in (CapabilityVersionDB.__table__, EvolutionFeedbackDB.__table__, UpgradeRequestDB.__table__):
        table.create(engine)
    with Session(engine) as session:
        register_version(session, capability_id="cap-a", version="1.0.0")
        session.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: Session(engine)
    client = TestClient(app)
    runtime = {"Authorization": f"Bearer {token(private_key, 'runtime')}"}
    founder = {"Authorization": f"Bearer {token(private_key, 'founder')}"}

    assert client.post("/api/v1/feedback", headers=founder, json={}).status_code == 403
    for performance in (1200, 1400):
        response = client.post("/api/v1/feedback", headers=runtime, json={"capability_id": "cap-a", "capability_version": "1.0.0", "source_system": "operator", "metrics": {"performance_ms": performance, "stability": 0.9}})
        assert response.status_code == 201
    assert client.get("/api/v1/capabilities/cap-a/versions", headers=founder).json()[0]["version"] == "1.0.0"
    created = client.post("/api/v1/capabilities/cap-a/upgrade-request", headers=runtime, json={}).json()
    request_id = created["upgrade_request_id"]
    assert client.get(f"/api/v1/upgrade-requests/{request_id}", headers=runtime).json()["status"] == "pending_review"
    assert client.post(f"/api/v1/upgrade-requests/{request_id}/decision", headers=runtime, json={"decision": "approved"}).status_code == 403
    assert client.post(f"/api/v1/upgrade-requests/{request_id}/decision", headers=founder, json={"decision": "approved"}).json()["status"] == "approved"
