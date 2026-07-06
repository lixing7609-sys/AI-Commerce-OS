# DB-006 Customer Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Customer Domain

Primary Table

customer

---

# 1. Purpose

The Customer schema defines customer profiles within AI Commerce OS.

A Customer represents an individual or organization purchasing products from a Business Cell. The schema stores identity, contact information, customer status and lifecycle metadata while supporting customer service, analytics and personalization.

---

# 2. Ownership

Owned By

Customer Domain

Primary Aggregate

Customer

Lifecycle Owner

Customer Service Agent

---

# 3. Primary Consumers

Agents

- Customer Service Agent
- Order Agent
- Analytics Agent
- Copywriting Agent

Workflows

- Customer Registration
- Order Creation
- Customer Support
- Marketing Campaign

---

# 4. Table Definition

Table Name

customer

Description

Stores customer master records.

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

customer_no

VARCHAR(64)

Unique Customer Number

---

name

VARCHAR(128)

Customer Name

---

phone

VARCHAR(32)

Mobile Number

---

email

VARCHAR(128)

Email Address

---

platform_user_id

VARCHAR(128)

Platform User Identifier

---

membership_level

VARCHAR(32)

standard

silver

gold

vip

---

status

VARCHAR(32)

active

inactive

blocked

---

registered_at

TIMESTAMP

---

last_order_at

TIMESTAMP

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

Customer

Customer

1

↓

N

Order

Customer

1

↓

N

Customer Service Ticket

---

# 8. Constraints

Customer Number must be unique within one Business Cell.

Phone number should be unique when available.

Soft Delete only.

---

# 9. Events

Produces

- CustomerCreated
- CustomerUpdated
- CustomerBlocked

Consumes

- OrderCompleted
- CustomerServiceCompleted

---

# 10. Security

Business Cell Isolation

Row-level Security

PII Encryption

Audit Logging Enabled

---

# 11. Lifecycle

Registered

↓

Active

↓

Returning Customer

↓

VIP

↓

Inactive

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Unique Index

business_cell_id + customer_no

Composite Index

phone

email

status + membership_level

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Customer Service | ✅ | ✅ | Customer lifecycle |
| Order Agent | ✅ | ✅ | Order association |
| Analytics | ✅ | ❌ | Customer analysis |
| Copywriting | ✅ | ❌ | Personalized content |

---

# 14. Example Record

```json
{
  "id": "cus_001",
  "business_cell_id": "bc_001",
  "customer_no": "CUS000001",
  "name": "Zhang San",
  "phone": "13800000000",
  "membership_level": "gold",
  "status": "active"
}
```

---

# 15. Future Extensions

Future versions may support

- Customer Tags
- Loyalty Points
- Customer Segmentation
- AI Customer Profile
- Lifetime Value Prediction

---

# References

DB-001 Database Architecture

DB-002 Business Cell Schema

DB-004 Order Schema

D-005 Customer Domain

A-009 Customer Service Agent

A-014 Analytics Agent