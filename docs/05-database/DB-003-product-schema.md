# DB-003 Product Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Product Domain

Primary Table

product

---

# 1. Purpose

The Product schema defines the core product entity of AI Commerce OS.

A Product is the central business object connecting research, pricing, inventory, content, publishing and order fulfillment.

All commercial activities revolve around the Product aggregate.

---

# 2. Ownership

Owned By

Product Domain

Primary Aggregate

Product

Lifecycle Owner

Product Manager

---

# 3. Primary Consumers

Agents

- Product Research Agent
- Pricing Agent
- Publishing Agent
- Copywriting Agent
- Image Agent
- Video Agent
- Analytics Agent

Workflows

- Product Research
- Product Approval
- Product Publishing
- Product Update

---

# 4. Table Definition

Table Name

product

Description

Stores the master product information.

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

sku

VARCHAR(64)

Unique SKU

---

spu

VARCHAR(64)

Standard Product Unit

---

name

VARCHAR(256)

Product Name

---

category

VARCHAR(128)

Product Category

---

brand

VARCHAR(128)

Brand Name

---

status

VARCHAR(32)

draft

approved

published

archived

---

cost_price

DECIMAL(18,2)

---

selling_price

DECIMAL(18,2)

---

currency

VARCHAR(16)

---

platform

VARCHAR(64)

Primary Selling Platform

---

content_package_id

UUID

Associated Content Package

---

knowledge_version

VARCHAR(32)

Knowledge Snapshot

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

Product

Product

1

↓

N

Inventory

Product

1

↓

N

Content Asset

Product

1

↓

N

Order Item

Product

1

↓

N

Knowledge Reference

---

# 8. Constraints

SKU must be unique within one Business Cell.

Selling Price must be greater than or equal to Cost Price.

Only approved products can be published.

Soft Delete only.

---

# 9. Events

Produces

- ProductCreated
- ProductUpdated
- ProductApproved
- ProductPublished
- ProductArchived

Consumes

- ResearchCompleted
- PricingCalculated
- ContentPackageCreated

---

# 10. Security

Business Cell Isolation

Row-level Security

Audit Logging Enabled

Sensitive Price Fields Protected

---

# 11. Lifecycle

Draft

↓

Research

↓

Pricing

↓

Approval

↓

Published

↓

Archived

↓

Soft Deleted

---

# 12. Index Strategy

Primary Key

id

Unique Index

business_cell_id + sku

Composite Index

status + category

platform + status

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Product Research | ✅ | ✅ | 创建产品 |
| Pricing | ✅ | ✅ | 更新价格 |
| Publishing | ✅ | ✅ | 更新发布状态 |
| Copywriting | ✅ | ❌ | 读取产品信息 |
| Image | ✅ | ❌ | 生成图片 |
| Video | ✅ | ❌ | 生成视频 |
| Analytics | ✅ | ❌ | 统计分析 |
| Monitoring | ✅ | ❌ | 健康检查 |

---

# 14. Example Record

```json
{
  "id": "prod_001",
  "business_cell_id": "bc_001",
  "sku": "LED-5050-5M",
  "spu": "LED-5050",
  "name": "5050 RGB LED Strip 5M",
  "category": "LED Strip",
  "brand": "LightOS",
  "status": "published",
  "cost_price": 32.50,
  "selling_price": 59.90,
  "currency": "CNY",
  "platform": "Douyin",
  "knowledge_version": "1.0"
}
```

---

# 15. Future Extensions

Future versions may support

- Product Variants
- Multi-language Product Data
- AI-generated Product Attributes
- Dynamic Pricing History
- Multi-platform SKU Mapping

---

# References

DB-001 Database Architecture

DB-002 Business Cell Schema

D-002 Product Domain

A-004 Product Research Agent

A-005 Pricing Agent

A-006 Publishing Agent

A-010 Copywriting Agent

RA-003 Event Architecture