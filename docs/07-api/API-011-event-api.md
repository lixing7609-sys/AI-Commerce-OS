# API-011 Event API

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Event API

---

# 1. Purpose

This document defines the Event APIs for AI Commerce OS.

The Event API provides standardized interfaces for publishing, subscribing, querying and replaying domain events across the runtime platform.

---

# 2. API Endpoints

POST /events

Publish an event.

GET /events

List events.

GET /events/{eventId}

Retrieve event details.

POST /events/subscribe

Register an event subscription.

DELETE /events/subscriptions/{subscriptionId}

Remove an event subscription.

POST /events/replay

Replay historical events.

---

# 3. OpenAPI Endpoint Definition

Authentication

Bearer JWT

Content-Type

application/json

---

# 4. Request Example

POST /events

```json
{
  "eventType": "ProductCreated",
  "businessCellId": "bc-001",
  "payload": {
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
    "eventId": "evt-10001",
    "status": "PUBLISHED"
  },
  "timestamp": "2026-01-01T12:00:00Z"
}
```

---

# 6. Error Codes

| Code | Description |
|------|-------------|
| EVENT001 | Event not found |
| EVENT002 | Invalid event payload |
| EVENT003 | Subscription failed |
| EVENT004 | Replay failed |
| EVENT005 | Unsupported event type |

---

# 7. Idempotency Rules

- GET requests are idempotent.
- Publish supports an optional `Idempotency-Key` header.
- Replay operations are idempotent for the same replay window.

---

# 8. Security Requirements

- JWT authentication required
- RBAC authorization
- Business Cell isolation
- Event audit logging

---

# 9. Domain Events

Produces

- EventPublished
- EventSubscribed
- EventReplayStarted
- EventReplayCompleted

Consumes

- All domain events defined by the system

---

# 10. Related Workflows

- WF-010 Event-driven Workflow
- WF-012 Workflow Recovery

---

# 11. Future Extensions

- Kafka Integration
- RabbitMQ Integration
- Event Streaming
- Dead Letter Queue
- Event Schema Registry

---

# References

API-001 API Design Principles

S-002 Event Specification

WF-010 Event-driven Workflow

DB-012 Event Schema