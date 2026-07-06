# A-012 Video Agent

# Metadata

Version

1.0

Status

Draft

Department

Content Department

Agent ID

content.video

Owner

Chief Software Architect

Execution Mode

Event Driven

Priority

High

Approval Policy

Optional

Preferred Model

Veo

Fallback Model

Wan2.2

Runtime Queue

content.video

Source Code

src/agents/content/video/

Workflow

workflows/content/video.json

---

# 1. Purpose

The Video Agent produces platform-ready commercial videos from approved content assets.

It orchestrates video planning, generation, editing and packaging while maintaining brand consistency across all supported commerce platforms.

The Agent manages the complete video production lifecycle rather than a single AI generation model.

---

# 2. Business Objective

Business Goal

Produce high-quality commercial videos automatically while reducing production cost and increasing publishing efficiency.

---

# 3. Department

Content Department

---

# 4. Agent Identity

Agent Name

Video Agent

Agent Class

Video Production Agent

Execution Pattern

Workflow Driven

Business Cell Scope

Single Business Cell

---

# 5. Business Responsibilities

Responsible for

- Short Video Generation
- Product Demonstration Video
- Advertisement Video
- Live Promotion Video
- Storyboard Planning
- Subtitle Generation
- Voice-over Coordination
- Video Version Management
- Multi-platform Adaptation

Not Responsible for

- Product Research
- Pricing
- Inventory
- Order Processing

---

# 6. Inputs

Consumes

- Content Package
- Image Package
- Product Information
- Brand Guideline
- Campaign Context
- Platform Rules
- Workflow Context

---

# 7. Outputs

Produces

- Short Video
- Product Video
- Advertisement Video
- Storyboard
- Subtitle File
- Video Metadata
- Video Package

---

# 8. Trigger Conditions

The Agent starts when

- ImagePackageCreated
- CampaignCreated
- Manual Video Request
- ProductUpdated

---

# 9. Execution Flow

Receive Video Request

↓

Load Content Package

↓

Load Image Assets

↓

Create Storyboard

↓

Generate Video

↓

Generate Subtitle

↓

Quality Validation

↓

Package Video Assets

↓

Publish Events

↓

Finish

---

# 10. State Machine

Requested

↓

Planning

↓

Generating

↓

Rendering

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

- Storyboard Planning
- Video Generation
- Subtitle Generation
- Voice-over Integration
- Multi-platform Formatting
- Brand Consistency Validation

---

# 12. Tool Integration

Allowed Tools

- Veo
- Wan2.2
- Kling
- Runway
- FFmpeg
- Whisper
- PostgreSQL
- Redis
- Object Storage
- n8n Workflow

Future Tools

- Local ComfyUI Video
- Lip Sync Engine
- AI Avatar Engine
- Music Generator

Denied

- Pricing Engine
- Inventory Update
- Order Processing

---

# 13. Knowledge Dependencies

Consumes

- Brand Guideline
- Marketing SOP
- Storyboard Templates
- Platform Video Rules
- Historical Video Assets
- Prompt Templates

---

# 14. Prompt Strategy

Role

AI Commerce Video Producer

Primary Goal

Generate engaging, platform-compliant commercial videos that maximize customer engagement.

Input Context

- Product Information
- Copywriting Package
- Image Package
- Brand Guideline
- Platform Rules

Output

- Storyboard
- Video Package
- Subtitle
- Metadata

Constraints

Maintain brand consistency.

Never fabricate product features.

Follow platform duration and format requirements.

Fallback

Publish VideoReviewRequired Event when quality validation fails.

---

# 15. LLM Strategy

Preferred Model

Veo

Fallback Model

Wan2.2

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
timeout: 900

retry: 2

parallelism: 2

approval: optional

queue: content.video
```

---

# 18. Events

Consumes

- ImagePackageCreated
- CampaignCreated

Produces

- VideoGenerated
- VideoPackageCreated
- VideoReviewRequired

---

# 19. Event Contract

VideoGenerated

```json
{
  "video_id": "",
  "product_id": "",
  "duration": 30,
  "resolution": "1080p",
  "version": "1.0",
  "timestamp": ""
}
```

VideoPackageCreated

```json
{
  "package_id": "",
  "product_id": "",
  "videos": [],
  "timestamp": ""
}
```

---

# 20. Downstream Consumers

- Publishing Agent
- Knowledge Agent
- Analytics Agent

---

# 21. Human Approval Policy

Routine Product Videos

Optional

Brand Campaign Videos

Required

Legal-sensitive Videos

Required

---

# 22. Security Boundary

Allowed

- Read Product Information
- Read Content Assets
- Read Brand Guideline
- Publish Video Events

Denied

- Modify Pricing
- Modify Inventory
- Modify Orders
- Publish Products

---

# 23. Observability

Runtime records

- Execution ID
- Product ID
- Video ID
- Storyboard Version
- Model
- GPU Usage
- Rendering Duration
- Events Published

---

# 24. Success Metrics

Measure

- Video Production Time
- Human Acceptance Rate
- Brand Consistency Score
- Platform Compliance Rate
- Engagement Rate
- Asset Reuse Rate

---

# 25. Failure Handling

Possible Failures

- Model Failure
- Rendering Timeout
- Invalid Storyboard
- Subtitle Failure
- Brand Validation Failure

Failures publish Events.

Runtime controls retry behavior.

---

# 26. Constraints

The Agent shall never

- Change Product Information
- Modify Pricing
- Publish Products
- Modify Orders

---

# 27. Implementation Mapping

Source Code

src/agents/content/video/

Primary Workflow

workflows/content/video.json

Primary Database Tables

content_asset

content_version

video_metadata

event_store

Primary Knowledge Collections

brand_guideline

storyboard_templates

video_templates

Runtime Queue

content.video

---

# 28. Test Specification

Scenario 1

Given

ImagePackageCreated

When

Brand Guideline exists

Then

VideoGenerated Event shall be published.

Scenario 2

Given

Platform requires a 30-second video

Then

Generated video shall satisfy duration requirements.

Scenario 3

Given

Brand validation fails

Then

VideoReviewRequired Event shall be published.

---

# 29. Future Extensions

Future versions may support

- AI Digital Human
- Personalized Video Generation
- Interactive Commerce Video
- Automatic Multi-language Dubbing
- Real-time Live Video Production

---

# References

A-010 Copywriting Agent

A-011 Image Agent

A-006 Publishing Agent

D-002 Product Domain

D-007 Knowledge Domain

RA-003 Event Architecture

S-004 Workflow Specification