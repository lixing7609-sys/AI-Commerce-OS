# DB-009 Event Store Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Runtime Domain

Primary Table

event_store

---

# 1. Purpose

The Event Store records every domain event generated within AI Commerce OS.

It serves as the immutable event backbone for Event-Driven Architecture, workflow orchestration, audit logging, analytics and runtime recovery.

The Event Store is append-only.

---

# 2. Ownership

Owned By

Runtime Domain

Primary Aggregate

Event

Lifecycle Owner

Runtime Engine

---

# 3. Primary Consumers

Agents

- Monitoring Agent
- Analytics Agent
- Knowledge Agent

Runtime

- Workflow Engine
- Event Bus
- Saga Coordinator
- Recovery Engine

---

# 4. Table Definition

Table Name

event_store

Description

Stores immutable domain and runtime events.

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

event_id

UUID

Global Event Identifier

---

event_type

VARCHAR(128)

---

aggregate_type

VARCHAR(64)

BusinessCell

Product

Order

Inventory

Customer

Knowledge

Runtime

Workflow

---

aggregate_id

UUID

---

business_cell_id

UUID

Nullable

---

event_version

INTEGER

---

event_payload

JSONB

---

metadata

JSONB

---

source

VARCHAR(128)

Originating Agent or Runtime

---

correlation_id

UUID

Workflow Correlation

---

causation_id

UUID

Parent Event

---

occurred_at

TIMESTAMP

---

created_at

TIMESTAMP

---

# 7. Relationships

Business Aggregate

↓

Event Store

↓

Workflow

↓

Analytics

↓

Audit

---

# 8. Constraints

Append Only

No Update

No Delete

Immutable Events

---

# 9. Events

Produces

- EventStored

Consumes

- All Domain Events
- All Runtime Events

---

# 10. Security

Append Permission Only

Read Audit Enabled

Business Cell Isolation

Integrity Verification

---

# 11. Lifecycle

Generated

↓

Validated

↓

Persisted

↓

Published

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Unique Index

event_id

Composite Index

aggregate_type + aggregate_id

business_cell_id + occurred_at

event_type + occurred_at

correlation_id

---

# 13. Agent Access Matrix

| Agent / Runtime | Read | Write | Notes |
|-----------------|:----:|:-----:|-------|
| Runtime Engine | ✅ | ✅ | Event persistence |
| Workflow Engine | ✅ | ❌ | Workflow replay |
| Analytics Agent | ✅ | ❌ | Event analysis |
| Monitoring Agent | ✅ | ❌ | Health monitoring |
| Knowledge Agent | ✅ | ❌ | Knowledge updates |

---

# 14. Example Record

```json
{
  "event_id": "evt_001",
  "event_type": "OrderCreated",
  "aggregate_type": "Order",
  "aggregate_id": "ord_001",
  "business_cell_id": "bc_001",
  "event_version": 1,
  "source": "Order Agent",
  "correlation_id": "wf_001",
  "causation_id": "cmd_001"
}
```

---

# 15. Future Extensions

Future versions may support

- Kafka Streaming
- Event Replay API
- Event Snapshot
- Cross-region Replication
- Event Compression

---

# References

RA-003 Event Architecture

RA-004 Runtime Component Architecture

S-002 Event Specification

DB-001 Database Architecture

A-015 Monitoring Agent