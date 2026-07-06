# DB-011 Runtime Schema

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

runtime_instance

---

# 1. Purpose

The Runtime schema defines runtime execution state for AI Commerce OS.

It manages Business Cell runtime instances, workflow executions, agent sessions and system health.

Runtime data is ephemeral and supports orchestration, monitoring and recovery.

---

# 2. Ownership

Owned By

Runtime Domain

Primary Aggregate

RuntimeInstance

Lifecycle Owner

Runtime Engine

---

# 3. Primary Consumers

Agents

- Monitoring Agent
- Analytics Agent

Runtime

- Runtime Engine
- Workflow Engine
- Scheduler
- Event Bus

---

# 4. Table Definition

Table Name

runtime_instance

Description

Stores runtime execution metadata.

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

runtime_id

VARCHAR(64)

Unique Runtime Identifier

---

runtime_type

VARCHAR(64)

workflow

agent

scheduler

service

---

status

VARCHAR(32)

starting

running

paused

stopped

failed

---

current_workflow

VARCHAR(128)

Nullable

---

host

VARCHAR(128)

Runtime Host

---

heartbeat_at

TIMESTAMP

Latest Heartbeat

---

started_at

TIMESTAMP

---

stopped_at

TIMESTAMP

Nullable

---

created_at

TIMESTAMP

---

updated_at

TIMESTAMP

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

Runtime Instance

Runtime Instance

1

↓

N

Workflow Execution

Runtime Instance

1

↓

N

Agent Session

---

# 8. Constraints

Runtime ID must be unique.

Heartbeat must be updated periodically.

Stopped runtimes are read-only.

---

# 9. Events

Produces

- RuntimeStarted
- RuntimeStopped
- RuntimePaused
- RuntimeRecovered
- HeartbeatUpdated

Consumes

- DeploymentCompleted
- WorkflowStarted
- RecoveryRequested

---

# 10. Security

Business Cell Isolation

Audit Logging Enabled

Runtime Authentication

Least Privilege

---

# 11. Lifecycle

Created

↓

Starting

↓

Running

↓

Paused

↓

Stopped

↓

Recovered

---

# 12. Index Strategy

Primary Key

id

Unique Index

runtime_id

Composite Index

business_cell_id + status

runtime_type + status

heartbeat_at

---

# 13. Agent Access Matrix

| Agent / Runtime | Read | Write | Notes |
|-----------------|:----:|:-----:|-------|
| Runtime Engine | ✅ | ✅ | Runtime lifecycle |
| Workflow Engine | ✅ | ✅ | Workflow execution |
| Monitoring Agent | ✅ | ❌ | Health monitoring |
| Analytics Agent | ✅ | ❌ | Runtime metrics |

---

# 14. Example Record

```json
{
  "id": "rt_001",
  "business_cell_id": "bc_001",
  "runtime_id": "runtime-led-cn-001",
  "runtime_type": "workflow",
  "status": "running",
  "host": "mac-mini-01",
  "heartbeat_at": "2026-07-06T10:00:00Z"
}
```

---

# 15. Future Extensions

Future versions may support

- Distributed Runtime Cluster
- Runtime Auto Scaling
- Agent Pool Management
- Multi-region Runtime
- Runtime Snapshot

---

# References

DB-009 Event Store Schema

RA-002 Runtime Lifecycle

RA-004 Runtime Component Architecture

A-015 Monitoring Agent

S-001 Runtime Specification