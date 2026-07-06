# DB-002 Business Cell Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Business Domain

Primary Table

business_cell

---

# 1. Purpose

The Business Cell schema defines the core organizational unit of AI Commerce OS.

A Business Cell represents an independently operated business entity with isolated data, workflows, agents and runtime context.

It is the primary tenant boundary of the platform.

---

# 2. Ownership

Owned By

Business Domain

Primary Aggregate

BusinessCell

Lifecycle Owner

Business Cell Manager

---

# 3. Primary Consumers

Agents

- Opportunity Discovery Agent
- Product Research Agent
- Pricing Agent
- Publishing Agent
- Analytics Agent
- Monitoring Agent

Workflows

- Business Cell Initialization
- Business Cell Deployment
- Runtime Startup

---

# 4. Table Definition

Table Name

business_cell

Description

Stores all Business Cell metadata.

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

code

VARCHAR(64)

Unique Business Cell Code

---

name

VARCHAR(128)

Business Cell Name

---

status

VARCHAR(32)

active

inactive

archived

---

owner

VARCHAR(128)

Business Owner

---

industry

VARCHAR(64)

Industry Type

---

country

VARCHAR(64)

Deployment Country

---

currency

VARCHAR(16)

Settlement Currency

---

timezone

VARCHAR(64)

Business Timezone

---

runtime_version

VARCHAR(32)

Runtime Version

---

knowledge_version

VARCHAR(32)

Knowledge Version

---

config_version

VARCHAR(32)

Configuration Version

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

↓

Products

↓

Orders

↓

Inventory

↓

Customers

↓

Workflows

↓

Runtime

All business entities reference

business_cell_id

---

# 8. Constraints

Business Cell Code must be unique.

Business Cell cannot be deleted while active.

Soft Delete only.

---

# 9. Events

Produces

- BusinessCellCreated
- BusinessCellActivated
- BusinessCellArchived

Consumes

- RuntimeInitialized
- DeploymentCompleted

---

# 10. Security

Row-level Isolation

Business Cell Boundary Enforcement

Least Privilege Access

Audit Logging Enabled

---

# 11. Lifecycle

Created

↓

Configured

↓

Activated

↓

Operating

↓

Archived

↓

Soft Deleted

---

# 12. Index Strategy

Primary Key

id

Unique Index

code

Composite Index

status

industry

country

---

# 13. Example Record

```json
{
  "id": "bc_001",
  "code": "LED_CN_001",
  "name": "China LED Business Cell",
  "status": "active",
  "industry": "LED",
  "country": "CN",
  "currency": "CNY",
  "timezone": "Asia/Shanghai",
  "runtime_version": "1.0",
  "knowledge_version": "1.0",
  "config_version": "1.0"
}
```

---

# 14. Future Extensions

Future versions may support

- Multi-region Deployment
- Cross-cell Collaboration
- Runtime Federation
- Dynamic Resource Scaling

---

# References

DB-001 Database Architecture

D-001 Business Domain

RA-001 Business Cell Architecture

A-013 Knowledge Agent

A-015 Monitoring Agent