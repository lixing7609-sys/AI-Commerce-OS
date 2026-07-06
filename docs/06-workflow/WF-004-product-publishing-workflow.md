# WF-004 Product Publishing Workflow

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Publishing Workflow

---

# 1. Purpose

This workflow defines how AI Commerce OS publishes products and content to external commerce platforms.

It coordinates content validation, platform adaptation, publishing execution and post-publication monitoring.

---

# 2. Trigger

A publishing workflow starts when:

- Product content is approved
- Product status changes to "Ready for Publishing"
- Scheduled publishing time is reached
- A user manually initiates publishing

---

# 3. Workflow Overview

Approved Product

↓

Platform Selection

↓

Platform Content Adaptation

↓

Platform Validation

↓

Publishing Execution

↓

Publishing Verification

↓

Platform Synchronization

↓

Monitoring

---

# 4. Participating Agents

- Publishing Agent
- Copywriting Agent
- Image Agent
- Monitoring Agent

---

# 5. Domain Objects

- Product
- Content Asset
- Platform
- Publishing Task
- Business Cell

---

# 6. Major Events

Produces

- PublishingStarted
- PublishingSucceeded
- PublishingFailed
- PlatformSynchronized

Consumes

- ContentApproved
- ProductUpdated
- RetryRequested

---

# 7. Human Approval Points

Approval is required before:

- Publishing premium products
- First publication to a new platform

Routine publishing may be fully automated.

---

# 8. Failure Handling

If publishing fails

↓

Retry

↓

Fallback Platform

↓

Manual Review

↓

Incident Logged

---

# 9. Success Criteria

- Product successfully published
- Platform validation passed
- Publishing confirmed
- Synchronization completed

---

# 10. Monitoring Metrics

Track

- Publishing Success Rate
- Average Publishing Time
- Retry Count
- Platform Availability
- Synchronization Delay

---

# 11. n8n Mapping

Typical workflow nodes

- Trigger
- PostgreSQL
- Content Validation
- Platform API
- Retry Logic
- Notification
- Event Publish

---

# 12. Runtime Mapping

Runtime Components

- Workflow Engine
- Publishing Agent
- Event Bus
- Platform Connector
- PostgreSQL
- Monitoring Service

---

# 13. Supported Platforms

Current

- Douyin Shop
- Toutiao Shop
- Xiaohongshu
- WeChat Channels

Future

- Shopee
- Lazada
- Amazon
- Shopify
- TikTok Shop Global

---

# 14. Future Extensions

- Intelligent Publish Scheduling
- Automatic Platform Optimization
- Cross-platform Synchronization
- AI-driven Publishing Strategy

---

# References

A-006 Publishing Agent

D-006 Platform Domain

WF-002 Product Lifecycle Workflow

WF-003 Content Generation Workflow

DB-009 Event Store Schema