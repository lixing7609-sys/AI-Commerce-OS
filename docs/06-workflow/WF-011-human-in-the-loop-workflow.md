# WF-011 Human-in-the-loop Workflow

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Workflow Governance

---

# 1. Purpose

This workflow defines how human operators participate in AI-driven workflows when review, approval or intervention is required.

Human-in-the-loop (HITL) ensures that critical business decisions remain controllable, auditable and compliant.

---

# 2. Trigger

A HITL workflow starts when:

- AI confidence falls below threshold
- Business policy requires approval
- Compliance validation fails
- Manual review is requested
- Exception handling is triggered

---

# 3. Workflow Overview

Workflow Task

↓

AI Execution

↓

Confidence Evaluation

↓

Decision Required?

├── No → Continue Workflow

└── Yes

↓

Human Review

↓

Approve / Reject / Edit

↓

Resume Workflow

---

# 4. Participating Roles

- Business Operator
- Product Manager
- Customer Service Specialist
- Compliance Reviewer
- System Administrator

---

# 5. Participating Agents

- Coordinator Agent
- Monitoring Agent
- Knowledge Agent

---

# 6. Major Events

Produces

- HumanReviewRequested
- HumanApproved
- HumanRejected
- WorkflowResumed

Consumes

- AIConfidenceLow
- ApprovalRequired
- ManualReviewRequested

---

# 7. Approval Policies

Mandatory Approval

- Product Publishing
- Refund Processing
- Compliance Documents

Optional Approval

- AI-generated Content
- Product Optimization
- Knowledge Updates

---

# 8. Failure Handling

If reviewer unavailable

↓

Escalate

↓

Assign Backup Reviewer

↓

Suspend Workflow

---

# 9. Success Criteria

- Decision recorded
- Workflow resumed
- Audit log completed
- Business policy satisfied

---

# 10. Monitoring Metrics

Track

- Approval Time
- Approval Rate
- Rejection Rate
- Escalation Count
- Workflow Resume Time

---

# 11. n8n Mapping

Typical workflow nodes

- Human Approval
- Wait
- Notification
- Switch
- PostgreSQL
- Event Publish

---

# 12. Runtime Mapping

Runtime Components

- Workflow Engine
- Coordinator Agent
- Event Bus
- PostgreSQL
- Monitoring Service

---

# 13. Future Extensions

- Mobile Approval
- Multi-level Approval
- AI-assisted Review
- Risk-based Approval Routing

---

# References

WF-009 Agent Collaboration Workflow

WF-010 Event-driven Workflow

A-015 Monitoring Agent

DB-009 Event Store Schema