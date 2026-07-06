# DB-005 Inventory Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Inventory Domain

Primary Table

inventory

---

# 1. Purpose

The Inventory schema manages stock availability for products within a Business Cell.

It maintains accurate inventory quantities, reservation status and stock movements to support order fulfillment and inventory optimization.

Inventory is the single source of truth for stock levels.

---

# 2. Ownership

Owned By

Inventory Domain

Primary Aggregate

Inventory

Lifecycle Owner

Inventory Agent

---

# 3. Primary Consumers

Agents

- Inventory Agent
- Order Agent
- Analytics Agent
- Monitoring Agent

Workflows

- Inventory Synchronization
- Stock Reservation
- Stock Release
- Stock Adjustment
- Inventory Audit

---

# 4. Table Definition

Table Name

inventory

Description

Stores current inventory balances.

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

product_id

UUID

FK → product.id

---

warehouse_code

VARCHAR(64)

Warehouse Identifier

---

available_quantity

INTEGER

Available Stock

---

reserved_quantity

INTEGER

Reserved Stock

---

total_quantity

INTEGER

Current Total Stock

---

safety_stock

INTEGER

Minimum Safe Quantity

---

status

VARCHAR(32)

normal

low_stock

out_of_stock

locked

---

last_sync_at

TIMESTAMP

Latest Inventory Synchronization

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

Inventory

Product

1

↓

N

Inventory

Inventory

1

↓

N

Inventory Movement

Inventory

1

↓

N

Reservation

---

# 8. Constraints

Available Quantity ≥ 0

Reserved Quantity ≥ 0

Total Quantity = Available Quantity + Reserved Quantity

Only active products may hold inventory.

Soft Delete only.

---

# 9. Events

Produces

- InventoryCreated
- InventoryUpdated
- InventoryReserved
- InventoryReleased
- InventoryAdjusted
- InventoryLowStock

Consumes

- ProductPublished
- OrderCreated
- OrderCancelled
- OrderCompleted

---

# 10. Security

Business Cell Isolation

Row-level Security

Audit Logging Enabled

Inventory Adjustment Authorization Required

---

# 11. Lifecycle

Initialized

↓

Available

↓

Reserved

↓

Allocated

↓

Adjusted

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Unique Index

business_cell_id + product_id + warehouse_code

Composite Index

status + warehouse_code

product_id + status

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Inventory Agent | ✅ | ✅ | Inventory lifecycle |
| Order Agent | ✅ | ✅ | Reserve / release stock |
| Analytics | ✅ | ❌ | Inventory reporting |
| Monitoring | ✅ | ❌ | Runtime monitoring |

---

# 14. Example Record

```json
{
  "id": "inv_001",
  "business_cell_id": "bc_001",
  "product_id": "prod_001",
  "warehouse_code": "HZ-01",
  "available_quantity": 980,
  "reserved_quantity": 20,
  "total_quantity": 1000,
  "safety_stock": 100,
  "status": "normal"
}
```

---

# 15. Future Extensions

Future versions may support

- Multi-Warehouse Allocation
- Batch Management
- Serial Number Tracking
- FIFO / LIFO Strategies
- Predictive Replenishment
- Supplier Inventory Integration

---

# References

DB-001 Database Architecture

DB-002 Business Cell Schema

DB-003 Product Schema

DB-004 Order Schema

D-004 Inventory Domain

A-008 Inventory Agent

RA-003 Event Architecture