# WF-003 Content Generation Workflow

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Content Workflow

---

# 1. Purpose

This workflow defines how AI Commerce OS automatically generates high-quality product content.

It coordinates product information, knowledge assets, AI models and human review to create publishable content for multiple commerce platforms.

---

# 2. Trigger

A content generation workflow starts when:

- A new product is created
- Product information is updated
- Marketing campaigns require refreshed content
- A user manually requests content generation

---

# 3. Workflow Overview

Product Information

↓

Knowledge Retrieval (RAG)

↓

Prompt Assembly

↓

AI Content Generation

↓

Content Validation

↓

Human Review (Optional)

↓

Content Storage

↓

Publishing Queue

---

# 4. Participating Agents

- Product Manager Agent
- Knowledge Agent
- Copywriting Agent
- Image Agent
- Video Agent
- Publishing Agent

---

# 5. Domain Objects

- Product
- Content Asset
- Knowledge Document
- Prompt Template
- Platform

---

# 6. Major Events

Produces

- ContentGenerationStarted
- ContentGenerated
- ContentValidated
- ContentApproved
- ContentStored

Consumes

- ProductCreated
- ProductUpdated
- KnowledgePublished

---

# 7. Human Approval Points

Approval is required before:

- Publishing high-value products
- Replacing existing published content

Approval may be skipped for low-risk automated workflows.

---

# 8. Failure Handling

If AI generation fails

↓

Retry

↓

Fallback Model

↓

Manual Editing

If validation fails

↓

Regenerate Content

---

# 9. Success Criteria

- Content generated successfully
- Brand guidelines followed
- Platform requirements satisfied
- Content stored successfully

---

# 10. Monitoring Metrics

Track

- Generation Time
- AI Success Rate
- Human Approval Rate
- Content Quality Score
- Publishing Readiness

---

# 11. n8n Mapping

Typical workflow nodes

- Trigger
- PostgreSQL
- Qdrant Retrieval
- LLM Node
- Validation
- Human Approval
- MinIO Storage
- Event Publish

---

# 12. Runtime Mapping

Runtime Components

- Workflow Engine
- Knowledge Agent
- Copywriting Agent
- Event Bus
- PostgreSQL
- Vector Store
- Object Storage

---

# 13. Future Extensions

- Multi-model Routing
- Automatic A/B Copy Testing
- Brand Style Learning
- Personalized Content Generation

---

# References

A-003 Copywriting Agent

A-013 Knowledge Agent

DB-008 Knowledge Schema

DB-010 Vector Store Schema

WF-002 Product Lifecycle Workflow