# API-003 Product API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Product API

---

# 1. Purpose

This document defines the Product APIs for AI Commerce OS.

The Product API provides standardized interfaces for creating, querying, updating and managing products across Business Cells and external commerce platforms.

---

# 2. API Endpoints

GET /products

List products with filtering and pagination.

GET /products/{productId}

Retrieve a single product.

POST /products

Create a new product.

PUT /products/{productId}

Replace an existing product.

PATCH /products/{productId}

Partially update a product.

DELETE /products/{productId}

Archive a product.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /products

```json
{
  "businessCellId": "bc-001",
  "sku": "LED-001",
  "name": "LED Strip Light",
  "category": "Lighting",
  "brand": "FutureLight",
  "price": 29.90,
  "currency": "CNY"
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "productId": "prod-10001",
    "status": "ACTIVE",
    "createdAt": "2026-01-01T12:00:00Z"
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| PRODUCT001 | Product not found |
| PRODUCT002 | Duplicate SKU |
| PRODUCT003 | Validation failed |
| PRODUCT004 | Business Cell mismatch |
| PRODUCT005 | Product archived |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- PUT is idempotent.
- PATCH is conditionally idempotent.
- DELETE performs a soft delete.
- POST supports an optional `Idempotency-Key` header to prevent duplicate product creation.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Audit logging for create, update and delete operations

---

# 9. Domain Events

Produces

- ProductCreated
- ProductUpdated
- ProductArchived

Consumes

- ProductImportRequested
- ProductSynchronizationRequested

---

# 10. Related Workflows

- WF-002 Product Lifecycle Workflow
- WF-003 Content Generation Workflow
- WF-004 Product Publishing Workflow

---

# 11. Future Extensions

- Bulk Product Import
- Product Versioning
- Variant Management
- AI Product Recommendation
- Cross-platform Product Synchronization

---

# References

API-001 API Design Principles

D-002 Product Domain

DB-002 Product Schema

WF-002 Product Lifecycle Workflow