# API-005 Order API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Order API

---

# 1. Purpose

This document defines the Order APIs for AI Commerce OS.

The Order API provides standardized interfaces for creating, querying, updating and managing customer orders across Business Cells and external commerce platforms.

---

# 2. API Endpoints

GET /orders

List orders with filtering and pagination.

GET /orders/{orderId}

Retrieve a single order.

POST /orders

Create a new order.

PATCH /orders/{orderId}

Update order status.

POST /orders/{orderId}/cancel

Cancel an order.

POST /orders/{orderId}/refund

Request a refund.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /orders

```json
{
  "businessCellId": "bc-001",
  "customerId": "cust-10001",
  "items": [
    {
      "productId": "prod-10001",
      "quantity": 2,
      "unitPrice": 29.90
    }
  ],
  "currency": "CNY",
  "paymentMethod": "ONLINE"
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "orderId": "order-10001",
    "status": "CREATED",
    "totalAmount": 59.80
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| ORDER001 | Order not found |
| ORDER002 | Invalid order status |
| ORDER003 | Inventory unavailable |
| ORDER004 | Payment required |
| ORDER005 | Refund not allowed |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- Order creation supports an optional `Idempotency-Key` header.
- Cancel and refund operations are idempotent.
- Order status transitions follow the defined state machine.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Audit logging for all order changes

---

# 9. Domain Events

Produces

- OrderCreated
- OrderConfirmed
- OrderCancelled
- OrderRefundRequested
- OrderCompleted

Consumes

- PaymentSucceeded
- PaymentFailed
- InventoryReserved
- InventoryReleased

---

# 10. Related Workflows

- WF-005 Order Processing Workflow
- WF-006 Inventory Workflow
- WF-007 Customer Service Workflow

---

# 11. Future Extensions

- Split Orders
- Partial Shipment
- Subscription Orders
- Cross-border Orders
- AI Fraud Detection

---

# References

API-001 API Design Principles

D-003 Order Domain

DB-003 Order Schema

WF-005 Order Processing Workflow