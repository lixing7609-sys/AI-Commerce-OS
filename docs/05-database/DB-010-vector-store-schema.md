# DB-010 Vector Store Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Knowledge Domain

Primary Store

Vector Store

---

# 1. Purpose

The Vector Store schema defines how semantic embeddings are stored, indexed and retrieved within AI Commerce OS.

It enables Retrieval-Augmented Generation (RAG), semantic search and AI reasoning by managing document chunks and vector representations independently from business data.

---

# 2. Ownership

Owned By

Knowledge Domain

Primary Aggregate

Embedding

Lifecycle Owner

Knowledge Agent

---

# 3. Primary Consumers

Agents

- Knowledge Agent
- Product Research Agent
- Copywriting Agent
- Customer Service Agent

Runtime

- RAG Engine
- Embedding Service
- Semantic Search

---

# 4. Store Definition

Store Name

vector_store

Description

Stores embeddings and semantic index metadata.

---

# 5. Primary Key

id

UUID

Immutable

---

# 6. Fields

id

UUID

Primary Key

---

knowledge_document_id

UUID

FK → knowledge_document.id

---

chunk_id

UUID

Unique Chunk Identifier

---

chunk_index

INTEGER

Chunk Sequence

---

chunk_text

TEXT

Original Chunk Content

---

embedding_model

VARCHAR(64)

Embedding Model Name

---

embedding_dimension

INTEGER

Vector Dimension

---

vector_id

VARCHAR(128)

Vector Database Identifier

---

language

VARCHAR(16)

---

status

VARCHAR(32)

pending

indexed

failed

archived

---

created_at

TIMESTAMP

---

updated_at

TIMESTAMP

---

# 7. Relationships

Knowledge Document

1

↓

N

Chunk

Chunk

1

↓

1

Embedding

Embedding

1

↓

1

Vector Index

---

# 8. Constraints

Chunk ID must be unique.

Vector ID must be unique.

Embedding dimension must match model definition.

No in-place modification of embeddings.

---

# 9. Events

Produces

- EmbeddingCreated
- EmbeddingIndexed
- EmbeddingDeleted

Consumes

- KnowledgePublished
- KnowledgeUpdated
- ReindexRequested

---

# 10. Security

Business Cell Isolation (when applicable)

Read-only Retrieval

Audit Logging Enabled

Embedding Integrity Verification

---

# 11. Lifecycle

Chunk Created

↓

Embedding Generated

↓

Indexed

↓

Retrieved

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Unique Index

chunk_id

vector_id

Composite Index

knowledge_document_id + chunk_index

embedding_model + status

---

# 13. Agent Access Matrix

| Agent / Runtime | Read | Write | Notes |
|-----------------|:----:|:-----:|-------|
| Knowledge Agent | ✅ | ✅ | Generate and maintain embeddings |
| Product Research | ✅ | ❌ | Semantic retrieval |
| Copywriting | ✅ | ❌ | RAG generation |
| Customer Service | ✅ | ❌ | FAQ retrieval |
| RAG Engine | ✅ | ❌ | Vector search |

---

# 14. Example Record

```json
{
  "id": "vec_001",
  "knowledge_document_id": "kd_001",
  "chunk_id": "chunk_001",
  "chunk_index": 1,
  "embedding_model": "bge-m3",
  "embedding_dimension": 1024,
  "vector_id": "qdrant_001",
  "language": "zh-CN",
  "status": "indexed"
}
```

---

# 15. Future Extensions

Future versions may support

- Multi-model Embeddings
- Hybrid Search
- Cross-lingual Retrieval
- Automatic Re-indexing
- Vector Compression

---

# References

DB-008 Knowledge Schema

RA-004 Runtime Component Architecture

D-007 Knowledge Domain

A-013 Knowledge Agent

S-003 Capability Specification