# A-011 Image Agent

# Metadata

Version

1.0

Status

Draft

Department

Content Department

Agent ID

content.image

Owner

Chief Software Architect

Execution Mode

Event Driven

Priority

High

Approval Policy

Optional

Preferred Model

Flux

Fallback Model

ComfyUI

Runtime Queue

content.image

Source Code

src/agents/content/image/

Workflow

workflows/content/image.json

---

# 1. Purpose

The Image Agent generates, optimizes and manages visual assets for commerce and marketing.

It transforms approved content packages into reusable image assets for different platforms while maintaining brand consistency.

The Agent is responsible for visual asset production, not product decisions.

---

# 2. Business Objective

Business Goal

Produce high-quality, platform-compliant visual assets efficiently while reducing manual design work and ensuring a unified brand identity.

---

# 3. Department

Content Department

---

# 4. Agent Identity

Agent Name

Image Agent

Agent Class

Visual Asset Production Agent

Execution Pattern

Workflow Driven

Business Cell Scope

Single Business Cell

---

# 5. Business Responsibilities

Responsible for

- Product Hero Image
- SKU Image
- Detail Images
- Marketing Banner
- Social Media Image
- Live Cover
- Thumbnail
- Brand KV
- Image Optimization
- Image Version Management

Not Responsible for

- Copywriting
- Pricing
- Publishing
- Inventory

---

# 6. Inputs

Consumes

- Content Package
- Product Information
- Brand Guideline
- Style Guide
- Platform Rules
- Workflow Context

---

# 7. Outputs

Produces

- Hero Image
- Detail Images
- Banner
- Thumbnail
- Social Media Image
- Image Package
- Image Metadata

---

# 8. Trigger Conditions

The Agent starts when

- ContentPackageCreated
- Manual Image Request
- CampaignCreated
- ProductUpdated

---

# 9. Execution Flow

Receive Image Request

↓

Load Content Package

↓

Load Brand Guideline

↓

Generate Prompt

↓

Generate Images

↓

Validate Brand Style

↓

Optimize Resolution

↓

Package Image Assets

↓

Publish Events

↓

Finish

---

# 10. State Machine

Requested

↓

Generating

↓

Optimizing

↓

Reviewing

↓

Approved

↓

Packaged

↓

Completed

Exception States

Rejected

Failed

NeedsHumanReview

---

# 11. Capabilities

Uses

- Prompt Composition
- AI Image Generation
- Background Removal
- Image Enhancement
- Style Consistency
- Multi-platform Adaptation

---

# 12. Tool Integration

Allowed Tools

- Flux
- ComfyUI
- Image Upscaler
- Background Remover
- PostgreSQL
- Redis
- Local Storage
- n8n Workflow

Future Tools

- Photoshop API
- OCR
- Vision Model

Denied

- Pricing Engine
- Order Management
- Inventory Update

---

# 13. Knowledge Dependencies

Consumes

- Brand Guideline
- Style Guide
- Product Knowledge
- Platform Image Rules
- Historical Image Assets
- Prompt Templates

---

# 14. Prompt Strategy

Role

AI Commerce Visual Designer

Primary Goal

Generate attractive, brand-consistent commercial images.

Input Context

- Product Information
- Copywriting Package
- Brand Guideline
- Style Guide
- Platform Rules

Output

- Image Prompt
- Image Assets
- Metadata

Constraints

Maintain brand consistency.

Never fabricate product appearance.

Always follow platform image specifications.

Fallback

Publish ImageReviewRequired Event when quality validation fails.

---

# 15. LLM Strategy

Preferred Model

Flux

Fallback Model

ComfyUI

Reasoning Level

Medium

Structured Output

JSON

Tool Calling

Enabled

---

# 16. Runtime Contract

Runtime provides

- Business Cell Context
- Workflow Context
- Knowledge Context
- Asset Storage
- Retry Policy
- Timeout Policy
- Observability

The Agent remains stateless.

---

# 17. Configuration

```yaml
timeout: 300

retry: 2

parallelism: 4

approval: optional

queue: content.image
```

---

# 18. Events

Consumes

- ContentPackageCreated
- ProductUpdated

Produces

- ImageGenerated
- ImagePackageCreated
- ImageReviewRequired

---

# 19. Event Contract

ImageGenerated

```json
{
  "image_id": "",
  "product_id": "",
  "asset_type": "hero_image",
  "version": "1.0",
  "timestamp": ""
}
```

ImagePackageCreated

```json
{
  "package_id": "",
  "product_id": "",
  "images": [],
  "timestamp": ""
}
```

---

# 20. Downstream Consumers

- Video Agent
- Publishing Agent
- Knowledge Agent
- Analytics Agent

---

# 21. Human Approval Policy

Routine Product Images

Optional

Brand Campaign Images

Required

Legal-sensitive Images

Required

---

# 22. Security Boundary

Allowed

- Read Product Information
- Read Brand Guideline
- Read Content Package
- Publish Image Events

Denied

- Publish Product
- Modify Pricing
- Modify Inventory
- Modify Orders

---

# 23. Observability

Runtime records

- Execution ID
- Product ID
- Image ID
- Model
- Prompt Version
- Generation Time
- GPU Usage
- Events Published

---

# 24. Success Metrics

Measure

- Generation Time
- Human Acceptance Rate
- Brand Consistency Score
- Platform Compliance Rate
- Asset Reuse Rate

---

# 25. Failure Handling

Possible Failures

- Model Failure
- GPU Timeout
- Invalid Prompt
- Brand Validation Failure

Failures publish Events.

Runtime controls retry behavior.

---

# 26. Constraints

The Agent shall never

- Change Product Data
- Modify Pricing
- Publish Listings
- Modify Orders

---

# 27. Implementation Mapping

Source Code

src/agents/content/image/

Primary Workflow

workflows/content/image.json

Primary Database Tables

content_asset

content_version

image_metadata

event_store

Primary Knowledge Collections

brand_guideline

style_guide

prompt_templates

Runtime Queue

content.image

---

# 28. Test Specification

Scenario 1

Given

ContentPackageCreated

When

Brand Guideline exists

Then

ImageGenerated Event shall be published.

Scenario 2

Given

Platform requires hero image

Then

Generated image shall satisfy platform specification.

Scenario 3

Given

Brand validation fails

Then

ImageReviewRequired Event shall be published.

---

# 29. Future Extensions

Future versions may support

- Multi-angle Rendering
- AI Product Photography
- 3D Asset Generation
- Automatic A/B Creative Generation
- Personalized Creative Production

---

# References

A-010 Copywriting Agent

A-006 Publishing Agent

D-002 Product Domain

D-007 Knowledge Domain

RA-003 Event Architecture

S-004 Workflow Specification