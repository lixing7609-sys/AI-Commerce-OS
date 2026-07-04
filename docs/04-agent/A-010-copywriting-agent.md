# A-010 Copywriting Agent

# Metadata

Version

1.0

Status

Draft

Department

Content Department

Agent ID

content.copywriting

Owner

Chief Software Architect

Execution Mode

Event Driven

Priority

High

Approval Policy

Optional

Preferred Model

DeepSeek R1

Fallback Model

Qwen3

Runtime Queue

content.copywriting

Source Code

src/agents/content/copywriting/

Workflow

workflows/content/copywriting.json

---

# 1. Purpose

The Copywriting Agent generates structured, persuasive and platform-optimized content assets for products and marketing campaigns.

It transforms approved business information into reusable content that supports commerce, branding and customer communication.

The Agent is responsible for content creation, not business decisions.

---

# 2. Business Objective

Business Goal

Produce high-quality content consistently across all supported commerce platforms while maintaining brand consistency and improving conversion performance.

---

# 3. Department

Content Department

---

# 4. Agent Identity

Agent Name

Copywriting Agent

Agent Class

Content Generation Agent

Execution Pattern

Workflow Driven

Business Cell Scope

Single Business Cell

---

# 5. Business Responsibilities

Responsible for

- Product Title Generation
- Product Description Generation
- Selling Point Extraction
- SEO Copywriting
- Advertising Copy
- Social Media Copy
- Live-stream Script Draft
- Content Optimization

Not Responsible for

- Product Research
- Pricing
- Image Generation
- Video Generation
- Product Publishing

---

# 6. Inputs

Consumes

- Product Information
- Pricing Result
- Product Research Report
- Brand Guideline
- Platform Rules
- Campaign Context
- Workflow Context

---

# 7. Outputs

Produces

- Product Title
- Product Description
- Bullet Points
- SEO Keywords
- Advertisement Copy
- Short Video Script
- Live-stream Script
- Content Package

---

# 8. Trigger Conditions

The Agent starts when

- ProductApproved
- PricingCompleted
- MarketingCampaignCreated
- Manual Content Request

---

# 9. Execution Flow

Receive Content Request

↓

Load Product Context

↓

Load Brand Guideline

↓

Retrieve Knowledge

↓

Generate Draft

↓

Validate Platform Compliance

↓

Optimize Copy

↓

Package Content Assets

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

- Prompt Engineering
- SEO Optimization
- Brand Tone Control
- Multi-platform Adaptation
- Structured Output
- Marketing Language Optimization

---

# 12. Tool Integration

Allowed Tools

- LLM
- Knowledge Base
- Prompt Repository
- PostgreSQL
- Redis
- n8n Workflow

Future Tools

- Search Engine
- Trend Analyzer
- Translation Engine
- Brand Style Validator

Denied

- Inventory Update
- Pricing Engine Write
- Platform Publishing

---

# 13. Knowledge Dependencies

Consumes

- Brand Guideline
- Product Knowledge
- Industry Knowledge
- Marketing SOP
- SEO Rules
- Platform Content Rules
- Historical High-performing Content
- Prompt Templates

---

# 14. Prompt Strategy

Role

AI Commerce Copywriter

Primary Goal

Generate persuasive, platform-compliant and conversion-oriented commercial copy.

Input Context

- Product Information
- Product Research
- Pricing
- Brand Guideline
- Platform Rules
- Target Audience

Output

- Structured Content Package
- Platform Variants
- SEO Keywords
- CTA Suggestions

Constraints

Always follow Brand Guideline.

Never fabricate product specifications.

Never violate platform content policies.

Fallback

If confidence is below threshold:

Publish ContentReviewRequired Event.

---

# 15. LLM Strategy

Preferred Model

DeepSeek R1

Fallback Model

Qwen3

Reasoning Level

High

Temperature

0.6

Structured Output

JSON

Tool Calling

Enabled

---

# 16. Runtime Contract

Runtime provides

- Business Cell Context
- Workflow Context
- Event Context
- Knowledge Context
- Retry Policy
- Timeout Policy
- Observability

The Agent remains stateless.

---

# 17. Configuration

```yaml
timeout: 180

retry: 2

parallelism: 8

approval: optional

memory: long

queue: content.copywriting
```

---

# 18. Events

Consumes

- ProductApproved
- PricingCompleted
- MarketingCampaignCreated

Produces

- CopyGenerated
- ContentPackageCreated
- ContentReviewRequired

---

# 19. Event Contract

CopyGenerated

```json
{
  "content_id": "",
  "product_id": "",
  "language": "zh-CN",
  "content_type": "product_description",
  "version": "1.0",
  "timestamp": ""
}
```

ContentPackageCreated

```json
{
  "package_id": "",
  "product_id": "",
  "assets": [],
  "timestamp": ""
}
```

---

# 20. Downstream Consumers

- Image Agent
- Video Agent
- Publishing Agent
- Knowledge Agent
- Analytics Agent

---

# 21. Human Approval Policy

Routine Product Content

Optional

Brand Campaign Content

Required

Legal-sensitive Content

Required

---

# 22. Security Boundary

Allowed

- Read Product Information
- Read Pricing
- Read Brand Guideline
- Read Knowledge
- Publish Content Events

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
- Content ID
- Prompt Version
- Model
- Token Usage
- Generation Time
- Tool Calls
- Events Published

---

# 24. Success Metrics

Measure

- Content Generation Time
- Human Acceptance Rate
- SEO Score
- Platform Compliance Rate
- Conversion Improvement
- Reuse Rate

---

# 25. Failure Handling

Possible Failures

- Knowledge Retrieval Failure
- Prompt Failure
- Model Timeout
- Invalid Product Information
- Low Confidence

Failures publish Events.

Runtime controls retry behavior.

---

# 26. Constraints

The Agent shall never

- Invent Product Specifications
- Modify Pricing
- Publish Listings
- Change Product Status

---

# 27. Implementation Mapping

Source Code

src/agents/content/copywriting/

Primary Workflow

workflows/content/copywriting.json

Primary Database Tables

content_asset

content_version

prompt_template

event_store

Primary Knowledge Collections

brand_guideline

marketing_sop

seo_rules

Runtime Queue

content.copywriting

---

# 28. Test Specification

Scenario 1

Given

ProductApproved

When

PricingCompleted

Then

CopyGenerated Event shall be published.

Scenario 2

Given

Brand Guideline exists

Then

Generated content shall comply with brand tone.

Scenario 3

Given

Confidence below threshold

Then

ContentReviewRequired Event shall be published.

---

# 29. Future Extensions

Future versions may support

- Personalized Copywriting
- Multi-language Generation
- A/B Test Variant Generation
- AI Campaign Planning
- Dynamic SEO Optimization
- Automatic Brand Voice Learning

---

# References

A-004 Product Research Agent

A-005 Pricing Agent

A-006 Publishing Agent

D-002 Product Domain

D-007 Knowledge Domain

RA-003 Event Architecture

S-003 Capability Specification

S-004 Workflow Specification