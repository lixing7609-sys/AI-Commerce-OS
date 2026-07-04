# A-005 Pricing Agent

Version

1.0

Status

Draft

Owner

Chief Software Architect

---

# 1. Purpose

The Pricing Agent determines commercially competitive and profitable pricing strategies for products.

Its mission is to maximize long-term business value by balancing market competitiveness, customer value perception and target profit margins.

The Agent provides pricing recommendations and pricing decisions according to configured approval policies.

---

# 2. Business Objective

Business Goal

Generate pricing strategies that improve profitability while maintaining market competitiveness.

The Agent continuously adapts pricing recommendations based on business rules, market signals and historical performance.

---

# 3. Department

Growth Department

---

# 4. Agent Identity

Agent ID

growth.pricing

Agent Name

Pricing Agent

Agent Class

Decision Agent

Execution Mode

Event Driven

Runtime Queue

growth.pricing

Priority

High

---

# 5. Inputs

The Agent may consume:

- Product Research Report
- Supplier Cost
- Competitor Prices
- Historical Sales
- Inventory Status
- Promotion Rules
- Business Rules
- Platform Policies
- Market Trend Data
- Knowledge Base

---

# 6. Outputs

The Agent produces:

- Pricing Recommendation
- Suggested Retail Price
- Promotion Strategy
- Margin Analysis
- Pricing Confidence
- Pricing Report

---

# 7. Trigger Conditions

The Agent may start when:

- ProductApprovedForPricing Event
- Manual Pricing Request
- Competitor Price Changed
- Supplier Cost Updated
- Scheduled Pricing Review

---

# 8. Execution Flow

Receive Pricing Request

↓

Load Business Context

↓

Retrieve Knowledge

↓

Analyze Market

↓

Estimate Costs

↓

Evaluate Competitor Pricing

↓

Generate Pricing Strategy

↓

Calculate Confidence Score

↓

Publish Pricing Events

↓

Finish

---

# 9. Capabilities

The Agent uses:

- Cost Analysis
- Margin Calculation
- Competitor Analysis
- Promotion Evaluation
- Profit Forecasting
- Knowledge Retrieval
- Report Generation

Capabilities remain reusable.

---

# 10. Knowledge Dependencies

The Agent consumes:

- Pricing Rules
- Product Knowledge
- Supplier Knowledge
- Industry Knowledge
- Promotion SOP
- Historical Pricing Reports
- Prompt Templates

Knowledge is accessed through the Knowledge Domain.

---

# 11. Prompt Strategy

Role

You are an AI Pricing Analyst.

Primary Goal

Recommend profitable and competitive pricing strategies.

Input Context

- Product Research Report
- Supplier Cost
- Competitor Prices
- Inventory Status
- Business Rules
- Historical Sales

Output

- Recommended Price
- Confidence Score
- Margin Analysis
- Pricing Rationale
- Risk Assessment

Constraints

- Never recommend prices below configured minimum margin.
- Always explain the pricing rationale.
- Follow Business Cell pricing policies.

Fallback

If confidence is below the configured threshold:

Publish `PricingReviewRequired`.

---

# 12. LLM Strategy

Preferred Model

DeepSeek R1

Fallback Model

Qwen3

Reasoning Level

High

Temperature

0.2

Structured Output

JSON

Tool Calling

Enabled

---

# 13. Runtime Contract

Runtime shall provide:

- Business Cell Context
- Event Context
- Knowledge Context
- Timeout Policy
- Retry Policy
- Memory Access
- Observability

The Agent remains stateless.

---

# 14. Events

Consumes

- ProductApprovedForPricing
- SupplierUpdated
- CompetitorPriceChanged
- WorkflowStarted

Produces

- PricingCompleted
- PricingReviewRequired
- PricingUpdated

---

# 15. Downstream Consumers

Typical consumers include:

- Publishing Agent
- AI Coordinator
- Human Owner

The Agent never invokes downstream Agents directly.

---

# 16. Human Approval Policy

Pricing Recommendation

Required

Automatic Price Adjustment

Disabled by default

Future versions may enable policy-based automatic pricing.

---

# 17. Success Metrics

Key metrics include:

- Gross Margin
- Pricing Acceptance Rate
- Price Competitiveness
- Profit Growth
- Confidence Score
- Execution Time

---

# 18. Failure Handling

Possible failures:

- Missing Supplier Cost
- Knowledge Retrieval Failure
- Runtime Timeout
- Invalid Pricing Rules
- Low Confidence

Failures shall publish Events.

Runtime determines retry behavior.

---

# 19. Constraints

The Agent shall never:

- Publish Products
- Modify Orders
- Update Inventory
- Execute Platform APIs directly
- Persist Business Data

---

# 20. Implementation Mapping

Source Code

src/agents/growth/pricing/

Primary Workflow

workflows/growth/pricing.json

Primary Events

ProductApprovedForPricing

PricingCompleted

PricingReviewRequired

Primary Database Tables

product

pricing_strategy

supplier

event_store

Primary Knowledge Collections

pricing_rules

industry_knowledge

historical_pricing

Runtime Queue

growth.pricing

---

# 21. Future Extensions

Future versions may support:

- Dynamic Pricing
- Multi-platform Pricing
- AI Promotion Optimization
- Demand-based Pricing
- Inventory-aware Pricing
- Region-specific Pricing

---

# References

A-001 Agent Architecture

A-002 Agent Organization

A-003 Opportunity Discovery Agent

A-004 Product Research Agent

D-002 Product Domain

D-007 Knowledge Domain

S-003 Capability Specification

RA-003 Event Architecture