# DB-007 Content Schema

# Metadata

Version

1.0

Status

Draft

Owner

Chief Software Architect

Domain

Content Domain

Primary Table

content_asset

---

# 1. Purpose

The Content schema defines all reusable digital assets generated or managed by AI Commerce OS.

A Content Asset represents text, images, videos or other media associated with products, campaigns and business operations.

Content is treated as a versioned business asset rather than a static file.

---

# 2. Ownership

Owned By

Content Domain

Primary Aggregate

ContentAsset

Lifecycle Owner

Content Department

---

# 3. Primary Consumers

Agents

- Copywriting Agent
- Image Agent
- Video Agent
- Publishing Agent
- Analytics Agent

Workflows

- Content Generation
- Content Review
- Content Publishing
- Content Optimization

---

# 4. Table Definition

Table Name

content_asset

Description

Stores reusable content assets.

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

---

product_id

UUID

FK → product.id

Nullable

---

asset_type

VARCHAR(32)

text

image

video

document

audio

---

title

VARCHAR(256)

---

storage_uri

TEXT

Object Storage Location

---

mime_type

VARCHAR(64)

---

language

VARCHAR(16)

---

version

VARCHAR(32)

Content Version

---

status

VARCHAR(32)

draft

review

approved

published

archived

---

generator

VARCHAR(64)

Agent or Human

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

Content Asset

Product

1

↓

N

Content Asset

Content Asset

1

↓

N

Publishing Record

---

# 8. Constraints

Asset checksum must be unique.

Published assets cannot be modified.

Soft Delete only.

---

# 9. Events

Produces

- ContentCreated
- ContentReviewed
- ContentApproved
- ContentPublished
- ContentArchived

Consumes

- ProductApproved
- CopywritingCompleted
- ImageGenerated
- VideoGenerated

---

# 10. Security

Business Cell Isolation

Object Storage Access Control

Audit Logging Enabled

Version Protection

---

# 11. Lifecycle

Draft

↓

Generated

↓

Review

↓

Approved

↓

Published

↓

Archived

---

# 12. Index Strategy

Primary Key

id

Composite Index

business_cell_id + asset_type

product_id + status

status + language

---

# 13. Agent Access Matrix

| Agent | Read | Write | Notes |
|--------|:----:|:-----:|-------|
| Copywriting | ✅ | ✅ | Text generation |
| Image | ✅ | ✅ | Image generation |
| Video | ✅ | ✅ | Video generation |
| Publishing | ✅ | ✅ | Publish status |
| Analytics | ✅ | ❌ | Performance analysis |

---

# 14. Example Record

```json
{
  "id": "asset_001",
  "business_cell_id": "bc_001",
  "product_id": "prod_001",
  "asset_type": "image",
  "title": "Main Product Image",
  "storage_uri": "s3://content/images/prod_001/main.webp",
  "mime_type": "image/webp",
  "language": "zh-CN",
  "version": "1.0",
  "status": "published",
  "generator": "Image Agent"
}
```

---

# 15. Future Extensions

Future versions may support

- Multi-language Assets
- AI Quality Scoring
- A/B Test Variants
- Copyright Tracking
- Content Performance History

---

# References

DB-001 Database Architecture

DB-003 Product Schema

D-006 Platform Domain

A-006 Publishing Agent

A-010 Copywriting Agent

A-011 Image Agent

A-012 Video Agent