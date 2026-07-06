# DB-004 Order Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Order Domain

Primary Table

order

---

# 1. Purpose

The Order schema defines the transactional lifecycle of customer purchases within AI Commerce OS.

An Order represents the commercial agreement between a customer and a Business Cell. It is the authoritative source for fulfillment, settlement and downstream analytics.

---

# 2. Ownership

Owned By

Order Domain

Primary Aggregate

Order

Lifecycle Owner

Order Agent

---

# 3. Primary Consumers

Agents

- Order Agent
- Inventory Agent
- Customer Service Agent
- Analytics Agent
- Monitoring Agent

Workflows

- Order Creation
- Payment Processing
- Fulfillment
- Refund
- After-sales Service

---

# 4. Table Definition

Table Name

order

Description

Stores order master records.

---

# 5. Primary Key

id

UUID

Immutable

---

# 6. Columns

id

UUID

Primary Key

---

business_cell_id

UUID

FK → business_cell.id

---

order_no

VARCHAR(64)

Unique Order Number

---

customer_id

UUID

FK → customer.id

---

status

VARCHAR(32)

pending

paid

processing

shipped

completed

cancelled

refunded

---

payment_status

VARCHAR(32)

unpaid

paid

failed

refunded

---

payment_method

VARCHAR(64)

---

currency

VARCHAR(16)

---

total_amount

DECIMAL(18,2)

---

discount_amount

DECIMAL(18,2)

---

shipping_fee

DECIMAL(18,2)

---

platform

VARCHAR(64)

---

created_at

TIMESTAMP

---

updated_at

TIMESTAMP

---

deleted_at

TIMESTAMP

Soft Delete

---

version

INTEGER

Optimistic Lock

---

# 7. Relationships

Business Cell

1

↓

N

Order

Customer

1

↓

N

Order

Order

1

↓

N

Order Item

Order

1

↓

1

Payment

Order

1

↓

N

Shipment

---

# 8. Constraints

Order Number must be unique.

Completed Orders cannot be modified.

Refund requires paid status.

Soft Delete only.

---

# 9. Events

Produces

- OrderCreated
- OrderPaid
- OrderShipped
- OrderCompleted
- OrderCancelled
- OrderRefunded

Consumes

- InventoryReserved
- PaymentSucceeded
- ShipmentCompleted

---

# 10. Security

Business Cell Isolation

Row-level Security

Audit Logging Enabled

Payment Fields Protected

---

# 11. Lifecycle

Pending

↓

Paid

↓

Processing

↓

Shipped

↓

Completed

↓

Archived

Exception

Cancelled

Refunded

---

# 12. Index Strategy

Primary Key

id

Unique Index

order_no

Composite Index

business_cell_id + status

customer_id + created_at

platform + status

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Order Agent | ✅ | ✅ | Full lifecycle |
| Inventory Agent | ✅ | ✅ | Inventory reservation |
| Customer Service | ✅ | ✅ | Refund / after-sales |
| Analytics | ✅ | ❌ | Reporting |
| Monitoring | ✅ | ❌ | Runtime monitoring |

---

# 14. Example Record

```json
{
  "id": "ord_001",
  "business_cell_id": "bc_001",
  "order_no": "DY202607060001",
  "customer_id": "cus_001",
  "status": "paid",
  "payment_status": "paid",
  "payment_method": "Alipay",
  "currency": "CNY",
  "total_amount": 199.80,
  "discount_amount": 20.00,
  "shipping_fee": 8.00,
  "platform": "Douyin"
}
```

---

# 15. Future Extensions

Future versions may support

- Split Orders
- Subscription Orders
- Cross-border Orders
- Multi-currency Settlement
- Intelligent Fraud Detection

---

# References

DB-001 Database Architecture

DB-002 Business Cell Schema

DB-003 Product Schema

D-003 Order Domain

A-007 Order Agent

A-009 Customer Service Agent

RA-003 Event Architecture