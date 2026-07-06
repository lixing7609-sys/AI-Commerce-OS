# DB-008 Knowledge Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Knowledge Domain

Primary Table

knowledge_document

---

# 1. Purpose

The Knowledge schema defines structured business knowledge managed by AI Commerce OS.

Knowledge is the foundation for AI reasoning, Retrieval-Augmented Generation (RAG), decision support and organizational learning.

Knowledge is treated as a governed business asset rather than unstructured text.

---

# 2. Ownership

Owned By

Knowledge Domain

Primary Aggregate

KnowledgeDocument

Lifecycle Owner

Knowledge Agent

---

# 3. Primary Consumers

Agents

- Knowledge Agent
- Product Research Agent
- Pricing Agent
- Copywriting Agent
- Customer Service Agent
- Analytics Agent

Workflows

- Knowledge Import
- Knowledge Review
- Embedding Generation
- Knowledge Retrieval

---

# 4. Table Definition

Table Name

knowledge_document

Description

Stores structured business knowledge metadata.

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

Nullable

---

title

VARCHAR(256)

---

knowledge_type

VARCHAR(64)

SOP

Product

Policy

FAQ

Market

Prompt

Brand

Workflow

Document

---

source

VARCHAR(128)

Knowledge Source

---

storage_uri

TEXT

Document Location

---

embedding_status

VARCHAR(32)

pending

processing

completed

failed

---

version

VARCHAR(32)

Knowledge Version

---

status

VARCHAR(32)

draft

approved

published

archived

---

checksum

VARCHAR(128)

Integrity Verification

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

# 7. Relationships

Business Cell

1

↓

N

Knowledge Document

Knowledge Document

1

↓

N

Knowledge Chunk

Knowledge Document

1

↓

N

Embedding

Knowledge Document

1

↓

N

Prompt Template

---

# 8. Constraints

Checksum must be unique.

Published knowledge cannot be modified.

Soft Delete only.

---

# 9. Events

Produces

- KnowledgeImported
- KnowledgeReviewed
- KnowledgePublished
- EmbeddingCompleted

Consumes

- DocumentUploaded
- WorkflowCompleted

---

# 10. Security

Business Cell Isolation

Role-based Access Control

Audit Logging Enabled

Version Protection

---

# 11. Lifecycle

Draft

↓

Imported

↓

Reviewed

↓

Embedded

↓

Published

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Composite Index

knowledge_type + status

business_cell_id + knowledge_type

embedding_status

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Knowledge Agent | ✅ | ✅ | Full lifecycle |
| Product Research | ✅ | ❌ | RAG retrieval |
| Pricing | ✅ | ❌ | Business rules |
| Copywriting | ✅ | ❌ | Brand & SOP |
| Customer Service | ✅ | ❌ | FAQ retrieval |
| Analytics | ✅ | ❌ | Knowledge statistics |

---

# 14. Example Record

```json
{
  "id": "kd_001",
  "business_cell_id": "bc_001",
  "title": "Douyin Product SOP",
  "knowledge_type": "SOP",
  "source": "Internal",
  "storage_uri": "minio://knowledge/sop/douyin.pdf",
  "embedding_status": "completed",
  "version": "1.0",
  "status": "published"
}
```

---

# 15. Future Extensions

Future versions may support

- Knowledge Graph
- Multi-language Knowledge
- Knowledge Quality Score
- Automatic Knowledge Expiration
- AI-generated Knowledge

---

# References

DB-001 Database Architecture

DB-007 Content Schema

D-007 Knowledge Domain

A-013 Knowledge Agent

RA-004 Runtime Component Architecture