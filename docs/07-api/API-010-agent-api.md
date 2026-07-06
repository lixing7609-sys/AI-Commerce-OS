# API-010 Agent API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Agent API

---

# 1. Purpose

This document defines the Agent APIs for AI Commerce OS.

The Agent API provides standardized interfaces for registering, discovering, invoking, monitoring and managing AI Agents across the runtime platform.

---

# 2. API Endpoints

GET /agents

List registered agents.

GET /agents/{agentId}

Retrieve agent details.

POST /agents

Register a new agent.

POST /agents/{agentId}/execute

Execute an agent task.

GET /agent-executions/{executionId}

Retrieve execution status.

POST /agents/{agentId}/enable

Enable an agent.

POST /agents/{agentId}/disable

Disable an agent.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /agents/{agentId}/execute

```json
{
  "businessCellId": "bc-001",
  "task": {
    "type": "generate_product_description",
    "productId": "prod-10001"
  }
}
```

---

# 5. Response Example

```json
{
  "success": true,
  "data": {
    "executionId": "agent-exec-10001",
    "status": "RUNNING"
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| AGENT001 | Agent not found |
| AGENT002 | Agent unavailable |
| AGENT003 | Task execution failed |
| AGENT004 | Unsupported task |
| AGENT005 | Agent disabled |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- Execute supports an optional `Idempotency-Key` header.
- Enable and Disable operations are idempotent.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Agent execution audit logging

---

# 9. Domain Events

Produces

- AgentRegistered
- AgentExecutionStarted
- AgentExecutionCompleted
- AgentExecutionFailed
- AgentEnabled
- AgentDisabled

Consumes

- WorkflowStarted
- TaskAssigned
- RetryRequested

---

# 10. Related Workflows

- WF-003 Content Generation Workflow
- WF-009 Agent Collaboration Workflow
- WF-012 Workflow Recovery

---

# 11. Future Extensions

- Agent Registry
- Multi-agent Orchestration
- Agent Capability Discovery
- Dynamic Agent Scaling
- MCP Tool Integration

---

# References

API-001 API Design Principles

A-001 ~ A-015 Agent Specifications

WF-009 Agent Collaboration Workflow

DB-010 Agent Schema