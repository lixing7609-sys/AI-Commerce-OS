# DB-001 Database Architecture

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Layer

Infrastructure

Database Type

Polyglot Persistence

---

# 1. Purpose

This document defines the overall database architecture of AI Commerce OS.

It specifies how business data, runtime data, events, knowledge and content assets are stored, managed and accessed across the platform.

The architecture separates operational data, analytical data and AI knowledge to improve scalability, maintainability and performance.

---

# 2. Design Principles

The database architecture follows these principles:

- Domain Driven Design
- Event Driven Architecture
- Business Cell Isolation
- Polyglot Persistence
- Read / Write Separation
- Immutable Event Store
- AI-first Knowledge Storage
- Horizontal Scalability

---

# 3. Database Topology

AI Commerce OS

↓

Application Layer

↓

Persistence Layer

├── PostgreSQL
│
├── Redis
│
├── Object Storage
│
├── Vector Database
│
└── Event Store

---

# 4. Storage Responsibilities

## PostgreSQL

Responsible for

- Master Business Data
- Product
- Order
- Customer
- Inventory
- Workflow Metadata
- Runtime Metadata
- Configuration

## Redis

Responsible for

- Cache
- Session
- Distributed Lock
- Queue Buffer
- Temporary State

## Object Storage

Responsible for

- Images
- Videos
- Documents
- Attachments
- Export Files

## Vector Database

Responsible for

- Knowledge Embeddings
- Prompt Embeddings
- SOP Retrieval
- Semantic Search

## Event Store

Responsible for

- Domain Events
- Runtime Events
- Workflow Events
- Audit Events

---

# 5. Domain Mapping

Business Domain

↓

Business Tables

Product Domain

↓

Product Tables

Order Domain

↓

Order Tables

Inventory Domain

↓

Inventory Tables

Customer Domain

↓

Customer Tables

Knowledge Domain

↓

Knowledge Tables

Content Domain

↓

Content Tables

Runtime Domain

↓

Runtime Tables

---

# 6. Database Layers

Layer 1

Operational Database

↓

Layer 2

Knowledge Database

↓

Layer 3

Analytics Database

↓

Layer 4

Object Storage

---

# 7. Data Ownership

Every table belongs to exactly one Domain.

Every Domain owns its own aggregate.

Cross-domain updates are performed through Events.

Direct cross-domain writes are prohibited.

---

# 8. Naming Convention

Tables

snake_case

Primary Key

id

Foreign Key

xxx_id

Timestamp

created_at

updated_at

deleted_at

Boolean

is_xxx

Version

version

Status

status

---

# 9. Multi-tenancy

Primary Isolation

Business Cell

Each Business Cell owns:

- Products
- Orders
- Inventory
- Customers
- Workflows
- Runtime Context

Shared Resources

- Knowledge
- Prompt Templates
- Runtime Engine
- Monitoring

---

# 10. Data Classification

Business Data

Transactional

Knowledge Data

Semi-static

Runtime Data

Ephemeral

Event Data

Immutable

Media Data

Large Object

Configuration

Static

---

# 11. Relationships

Domain

↓

Aggregate

↓

Entity

↓

Value Object

↓

Event

Database tables shall follow aggregate boundaries.

---

# 12. Security

Row-level isolation

Business Cell isolation

Encrypted secrets

Encrypted credentials

Audit logging

Least privilege

---

# 13. Scalability

Horizontal Business Cell expansion

Read replicas

Partitioned Event Store

Independent Vector Database

Independent Object Storage

Stateless Runtime

---

# 14. Disaster Recovery

Daily Backup

Point-in-time Recovery

Event Replay

Knowledge Rebuild

Object Storage Replication

---

# 15. Technology Mapping

Operational Database

PostgreSQL

Cache

Redis

Vector Store

Qdrant

Object Storage

MinIO

Event Store

PostgreSQL Event Table

Future

Kafka

ClickHouse

ElasticSearch

---

# 16. Data Flow

Business Request

↓

Business Aggregate

↓

Database Transaction

↓

Publish Event

↓

Knowledge Update

↓

Analytics

↓

Monitoring

---

# 17. Primary Schemas

business_cell

product

order

inventory

customer

content

knowledge

workflow

runtime

event_store

monitoring

analytics

---

# 18. Database Standards

UTF-8 Encoding

UTC Timestamp

UUID Primary Keys

Optimistic Locking

Soft Delete

Version Control

Audit Fields Required

---

# 19. Lifecycle

Design

↓

Migration

↓

Deployment

↓

Operation

↓

Archive

↓

Retention

↓

Deletion

---

# 20. References

RA-001 Business Cell Architecture

RA-003 Event Architecture

RA-004 Runtime Component Architecture

D-001 Business Domain

D-007 Knowledge Domain

A-013 Knowledge Agent

A-014 Analytics Agent

A-015 Monitoring Agent