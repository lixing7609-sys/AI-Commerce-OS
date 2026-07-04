# A-007 Order Agent

# Metadata

Version

1.0

Status

Draft

Department

Commerce Department

Agent ID

commerce.order

Owner

Chief Software Architect

Execution Mode

Event Driven

Priority

Critical

Approval Policy

Never

Preferred Model

DeepSeek R1

Fallback Model

Qwen3

Runtime Queue

commerce.order

Source Code

src/agents/commerce/order/

Workflow

workflows/commerce/order.json

---

# 1. Purpose

The Order Agent manages the complete lifecycle of customer orders.

It coordinates order validation, payment confirmation, fulfillment status and downstream business events.

The Agent never performs manual business decisions.

---

# 2. Business Objective

Business Goal

Ensure every customer order is processed accurately, consistently and traceably across the Business Cell.

---

# 3. Department

Commerce Department

---

# 4. Agent Identity

Agent Name

Order Agent

Agent Class

Execution Agent

Execution Pattern

State Machine

Business Cell Scope

Single Business Cell

---

# 5. Business Responsibilities

Responsible for

- Order Creation
- Order Validation
- Order Status Management
- Payment Coordination
- Fulfillment Coordination
- Order Completion

Not Responsible for

- Pricing
- Publishing
- Inventory Calculation
- Customer Support Decisions

---

# 6. Inputs

Consumes

- PublicationCompleted
- Customer Checkout
- Payment Notification
- Inventory Allocation
- Workflow Context

---

# 7. Outputs

Produces

- Order Record
- Order Status
- Order Timeline
- Fulfillment Request
- Completion Report

---

# 8. Trigger Conditions

The Agent starts when

- Customer Checkout
- PaymentReceived
- InventoryAllocated
- Manual Order Review

---

# 9. Execution Flow

Receive Order Request

↓

Validate Order

↓

Create Order

↓

Wait Payment

↓

Confirm Payment

↓

Coordinate Fulfillment

↓

Monitor Delivery

↓

Complete Order

↓

Publish Events

↓

Finish

---

# 10. State Machine

Created

↓

PendingPayment

↓

Paid

↓

Allocated

↓

Packing

↓

Shipped

↓

Delivered

↓

Completed

Exception States

Cancelled

Refunding

Refunded

Failed

---

# 11. Capabilities

Uses

- Order Validation
- Payment Verification
- Fulfillment Coordination
- Status Management
- Timeline Recording
- Report Generation

---

# 12. Tool Integration

Allowed Tools

- PostgreSQL
- Redis
- n8n Workflow
- Payment Connector
- Logistics Connector
- MCP Platform Connector

Denied

- Supplier Database Write
- Pricing Engine Write
- Prompt Repository Write

---

# 13. Knowledge Dependencies

Consumes

- Order SOP
- Fulfillment SOP
- Refund Policy
- Platform Rules
- Customer Rules

---

# 14. Prompt Strategy

Role

AI Order Coordinator

Primary Goal

Maintain correct order lifecycle.

Output

- Updated Order Status
- Next Workflow Action
- Exception Report

Constraints

Never skip lifecycle states.

Never create duplicate orders.

---

# 15. LLM Strategy

Preferred Model

DeepSeek R1

Fallback Model

Qwen3

Reasoning Level

Medium

Temperature

0.1

Structured Output

JSON

---

# 16. Runtime Contract

Runtime provides

- Business Cell Context
- Workflow Context
- Event Context
- Timeout Policy
- Retry Policy
- Distributed Lock
- Memory Access
- Observability

The Agent remains stateless.

---

# 17. Configuration

Default Configuration

```yaml
timeout: 120

retry: 3

parallelism: 10

approval: false

memory: long

queue: commerce.order
```

---

# 18. Events

Consumes

- PublicationCompleted
- PaymentReceived
- InventoryAllocated

Produces

- OrderCreated
- OrderPaid
- OrderShipped
- OrderCompleted
- OrderCancelled
- OrderRefunded

---

# 19. Event Contract

OrderCreated

```json
{
  "event_id": "",
  "trace_id": "",
  "business_cell": "",
  "order_id": "",
  "status": "Created",
  "timestamp": ""
}
```

OrderPaid

```json
{
  "order_id": "",
  "payment_id": "",
  "amount": "",
  "timestamp": ""
}
```

OrderCompleted

```json
{
  "order_id": "",
  "completion_time": "",
  "customer_id": ""
}
```

---

# 20. Downstream Consumers

- Inventory Agent
- Customer Service Agent
- Analytics Agent
- Monitoring Agent

---

# 21. Human Approval Policy

Normal Orders

Not Required

Refund Above Threshold

Required

Manual Exception Handling

Required

---

# 22. Security Boundary

Allowed

- Read Orders
- Update Order Status
- Read Payment Status
- Publish Events

Denied

- Modify Product
- Modify Pricing
- Modify Prompt
- Delete Historical Orders

---

# 23. Observability

Runtime records

- Execution ID
- Order ID
- Trace ID
- Business Cell
- Model
- Tokens
- Duration
- Tool Calls
- Events Published
- Retry Count

---

# 24. Success Metrics

Measure

- Order Success Rate
- Processing Time
- Fulfillment Accuracy
- Exception Rate
- Retry Rate
- Customer Satisfaction

---

# 25. Failure Handling

Possible Failures

- Payment Timeout
- Duplicate Order
- Inventory Allocation Failure
- Workflow Failure
- Runtime Timeout

Failures publish Events.

Runtime determines retry behavior.

---

# 26. Constraints

The Agent shall never

- Modify Pricing
- Publish Products
- Change Supplier Data
- Write Knowledge Documents

---

# 27. Implementation Mapping

Source Code

src/agents/commerce/order/

Primary Workflow

workflows/commerce/order.json

Primary Database Tables

order

order_item

payment

event_store

workflow_execution

Primary Knowledge Collections

order_sop

refund_policy

Runtime Queue

commerce.order

---

# 28. Test Specification

Scenario 1

Given

PaymentReceived

When

InventoryAllocated

Then

OrderCreated shall become Paid.

Scenario 2

Given

OrderPaid

When

ShipmentConfirmed

Then

OrderShipped Event shall be published.

Scenario 3

Given

Payment Timeout

Then

OrderCancelled Event shall be published.

---

# 29. Future Extensions

Future versions may support

- Multi-warehouse Fulfillment
- Cross-border Orders
- AI Fraud Detection
- Smart Split Shipment
- Autonomous Exception Recovery

---

# References

A-001 Agent Architecture

A-002 Agent Organization

A-006 Publishing Agent

D-003 Order Domain

RA-003 Event Architecture

S-004 Workflow Specification