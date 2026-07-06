# API-007 Customer API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Customer API

---

# 1. Purpose

This document defines the Customer APIs for AI Commerce OS.

The Customer API provides standardized interfaces for managing customer profiles, membership, preferences, communication history and customer lifecycle.

---

# 2. API Endpoints

GET /customers

List customers.

GET /customers/{customerId}

Retrieve customer details.

POST /customers

Create a customer.

PATCH /customers/{customerId}

Update customer profile.

GET /customers/{customerId}/orders

Retrieve customer order history.

GET /customers/{customerId}/interactions

Retrieve customer interaction history.

POST /customers/{customerId}/tags

Assign customer tags.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /customers

```json
{
  "businessCellId": "bc-001",
  "name": "Zhang San",
  "mobile": "13800000000",
  "email": "user@example.com"
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "customerId": "cust-10001",
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
| CUSTOMER001 | Customer not found |
| CUSTOMER002 | Duplicate customer |
| CUSTOMER003 | Invalid customer data |
| CUSTOMER004 | Customer archived |
| CUSTOMER005 | Tag assignment failed |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- PATCH is idempotent.
- Tag assignment supports an optional Idempotency-Key.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Customer privacy protection
- Audit logging

---

# 9. Domain Events

Produces

- CustomerCreated
- CustomerUpdated
- CustomerTagged
- CustomerArchived

Consumes

- OrderCompleted
- CustomerServiceClosed

---

# 10. Related Workflows

- WF-007 Customer Service Workflow

---

# 11. Future Extensions

- Membership System
- Customer Segmentation
- AI Customer Scoring
- Loyalty Program
- Customer Journey Analytics

---

# References

API-001 API Design Principles

D-005 Customer Domain

DB-005 Customer Schema

WF-007 Customer Service Workflow