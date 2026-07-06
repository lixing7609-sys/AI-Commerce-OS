# DB-012 Database Index Strategy

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Database Infrastructure

---

# 1. Purpose

This document defines the indexing strategy for AI Commerce OS.

The objective is to ensure predictable query performance, scalability and maintainability across all Business Cells and runtime services.

---

# 2. Design Principles

- Primary Key on every table
- Business Keys must be indexed
- Frequently queried fields require indexes
- Composite indexes follow access patterns
- Avoid unnecessary indexes
- Optimize for read-heavy workloads

---

# 3. Primary Index Rules

Every table must contain:

- Primary Key
- Unique Business Identifier
- Foreign Key Indexes
- Created Time Index (when required)

---

# 4. Composite Index Strategy

Examples

Business Cell

business_cell_id + status

Product

business_cell_id + sku

Order

business_cell_id + created_at

Inventory

product_id + warehouse_code

Knowledge

knowledge_type + status

Runtime

runtime_type + status

---

# 5. Time-based Indexes

Recommended for

- Event Store
- Runtime
- Workflow Execution
- Monitoring Logs

Fields

created_at

occurred_at

heartbeat_at

---

# 6. Full-text Search

Applicable Domains

- Knowledge
- Product Description
- SOP
- FAQ

Recommended Technologies

- PostgreSQL Full Text
- Elasticsearch (optional)

---

# 7. Vector Search

Do not store vectors inside PostgreSQL.

Recommended

- Qdrant
- Milvus
- pgvector (small deployments)

---

# 8. Performance Guidelines

Target

Simple Query

<20 ms

Business Query

<100 ms

Analytics Query

<2 seconds

Vector Retrieval

<200 ms

---

# 9. Monitoring

Monitor

- Slow Queries
- Missing Indexes
- Index Size
- Fragmentation

---

# 10. Future Improvements

- Automatic Index Recommendation
- Partition-aware Indexes
- Adaptive Query Optimization

---

# References

DB-001 Database Architecture

DB-009 Event Store Schema

DB-010 Vector Store Schema