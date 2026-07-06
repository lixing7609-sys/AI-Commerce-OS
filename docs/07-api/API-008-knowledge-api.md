# API-008 Knowledge API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Knowledge API

---

# 1. Purpose

This document defines the Knowledge APIs for AI Commerce OS.

The Knowledge API provides standardized interfaces for managing, retrieving, indexing and searching knowledge assets that support AI Agents and business workflows.

---

# 2. API Endpoints

GET /knowledge

List knowledge documents.

GET /knowledge/{knowledgeId}

Retrieve a knowledge document.

POST /knowledge

Create a knowledge document.

PATCH /knowledge/{knowledgeId}

Update a knowledge document.

DELETE /knowledge/{knowledgeId}

Archive a knowledge document.

POST /knowledge/search

Semantic search.

POST /knowledge/index

Trigger knowledge indexing.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /knowledge/search

```json
{
  "query": "LED strip installation guide",
  "topK": 5,
  "businessCellId": "bc-001"
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "knowledgeId": "kb-10001",
        "title": "LED Installation Guide",
        "score": 0.96
      }
    ]
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| KNOWLEDGE001 | Document not found |
| KNOWLEDGE002 | Indexing failed |
| KNOWLEDGE003 | Search failed |
| KNOWLEDGE004 | Invalid embedding |
| KNOWLEDGE005 | Permission denied |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- Search requests are read-only.
- Index requests are idempotent for the same document version.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Audit logging
- Knowledge access control

---

# 9. Domain Events

Produces

- KnowledgeCreated
- KnowledgeUpdated
- KnowledgeIndexed
- KnowledgeArchived

Consumes

- KnowledgeImportRequested
- WorkflowCompleted

---

# 10. Related Workflows

- WF-008 Knowledge Pipeline Workflow

---

# 11. Future Extensions

- Multi-vector Search
- Hybrid Search
- Knowledge Graph
- Automatic Knowledge Extraction
- Multi-language Retrieval

---

# References

API-001 API Design Principles

D-007 Knowledge Domain

DB-008 Knowledge Schema

WF-008 Knowledge Pipeline Workflow