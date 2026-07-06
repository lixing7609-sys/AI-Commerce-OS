# API-002 Authentication API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

API Security

---

# 1. Purpose

This document defines authentication and authorization APIs for AI Commerce OS.

The objective is to provide secure identity verification, access control and token management for users, AI Agents and external systems.

---

# 2. Authentication Methods

Supported methods

- OAuth2
- JWT Access Token
- Refresh Token
- API Key (Internal Services)
- Service Account
- Future: OpenID Connect (OIDC)

---

# 3. Authorization Model

Role-Based Access Control (RBAC)

Roles

- Administrator
- Business Operator
- Agent
- External Platform
- Read-only User

Business Cell isolation must always be enforced.

---

# 4. API Endpoints

POST /auth/login

Authenticate user and issue tokens.

POST /auth/refresh

Refresh access token.

POST /auth/logout

Invalidate current session.

GET /auth/profile

Return authenticated user profile.

POST /auth/service-token

Issue service account token.

---

# 5. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 6. Request Example

POST /auth/login

```json
{
  "username": "admin@example.com",
  "password": "********"
}
```

---

# 7. Response Example

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 8. Error Codes

| Code | Description |
|------|-------------|
| AUTH001 | Invalid credentials |
| AUTH002 | Token expired |
| AUTH003 | Unauthorized |
| AUTH004 | Forbidden |
| AUTH005 | Service account invalid |

---

# 9. Idempotency Rules

- Login is not idempotent.
- Logout is idempotent.
- Refresh token is single-use.
- Service tokens have configurable expiration.

---

# 10. Security Requirements

- HTTPS only
- JWT signing
- Token expiration
- Refresh token rotation
- Audit logging
- Rate limiting

---

# 11. Future Extensions

- Multi-factor Authentication (MFA)
- Passkey Authentication
- SSO
- Enterprise WeChat Login
- OAuth Platform Login

---

# References

API-001 API Design Principles

RA-006 Security Architecture

WF-011 Human-in-the-loop Workflow