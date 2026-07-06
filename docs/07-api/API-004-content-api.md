# API-004 Content API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Content API

---

# 1. Purpose

This document defines the Content APIs for AI Commerce OS.

The Content API provides standardized interfaces for generating, managing, validating and publishing AI-generated content across multiple commerce platforms.

---

# 2. API Endpoints

GET /contents

List content assets.

GET /contents/{contentId}

Retrieve a content asset.

POST /contents

Create AI-generated content.

PATCH /contents/{contentId}

Update content.

POST /contents/{contentId}/validate

Validate generated content.

POST /contents/{contentId}/approve

Approve content for publishing.

DELETE /contents/{contentId}

Archive content.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /contents

```json
{
  "productId": "prod-10001",
  "type": "product_description",
  "language": "zh-CN",
  "platform": "douyin",
  "promptTemplate": "product-description-v1"
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "contentId": "content-10001",
    "status": "GENERATING",
    "workflowId": "wf-003"
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| CONTENT001 | Content not found |
| CONTENT002 | Validation failed |
| CONTENT003 | AI generation failed |
| CONTENT004 | Approval required |
| CONTENT005 | Unsupported platform |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- Validation is idempotent.
- Approval is idempotent.
- POST supports an optional `Idempotency-Key` header.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Audit logging
- Prompt template access control

---

# 9. Domain Events

Produces

- ContentGenerationStarted
- ContentGenerated
- ContentValidated
- ContentApproved
- ContentArchived

Consumes

- ProductCreated
- ProductUpdated
- KnowledgePublished

---

# 10. Related Workflows

- WF-003 Content Generation Workflow
- WF-004 Product Publishing Workflow
- WF-008 Knowledge Pipeline Workflow

---

# 11. Future Extensions

- Image Generation API
- Video Generation API
- Multi-model Routing
- Brand Style Learning
- Automatic A/B Content Testing

---

# References

API-001 API Design Principles

D-002 Product Domain

DB-006 Content Schema

WF-003 Content Generation Workflow