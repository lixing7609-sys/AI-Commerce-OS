---
document_id: DOC-003
title: Engineering Standards
version: 1.0.0
status: Draft
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-01
---

# Engineering Standards

> This document defines the engineering rules for the AI Commerce OS project.
>
> Every contributor (human or AI) must follow these standards before making any change to the repository.

---

# 1. Purpose

The purpose of this document is to ensure that AI Commerce OS remains:

- Consistent
- Maintainable
- Scalable
- Readable
- Extensible

Engineering consistency is considered more important than development speed.

---

# 2. Governance

Project roles are fixed.

| Role | Responsibility |
|------|----------------|
| Founder / Product Owner | Business decisions and product direction |
| Chief Software Architect | Architecture, specifications, reviews, ADRs |
| Senior Software Engineer | Implementation according to specifications |
| AI Agents | Execute assigned operational tasks |

Architecture decisions belong only to the Chief Software Architect.

Implementation follows approved specifications.

---

# 3. Development Workflow

Every feature must follow the same lifecycle.

```
Idea
    │
    ▼
Discussion
    │
    ▼
Architecture Decision (ADR)
    │
    ▼
Specification
    │
    ▼
Review
    │
    ▼
Implementation
    │
    ▼
Testing
    │
    ▼
Release
```

No implementation is allowed before an approved specification exists.

---

# 4. Documentation Rules

All project documentation is written in Markdown.

Each document must have a Front Matter section.

Example:

```yaml
---
document_id: DOC-XXX
title:
version:
status:
owner:
reviewer:
last_updated:
---
```

Documentation is considered source code.

---

# 5. Naming Conventions

## Documents

Project documents:

```
DOC-001
DOC-002
DOC-003
```

Specifications:

```
S-001
S-002
S-003
```

Architecture Decision Records:

```
ADR-0001
ADR-0002
```

---

## Agents

Every AI component must be named:

```
XXX Agent
```

Examples:

- Product Agent
- Inventory Agent
- Pricing Agent
- Customer Service Agent

Do not use:

- ProductService
- ProductManagerAI
- Product_Module

---

## Events

Events describe completed business facts.

Examples:

- Product Created
- Product Updated
- Order Paid
- Inventory Changed
- Customer Message Received

Avoid imperative names.

---

## Workflows

Workflow names use:

```
Verb + Noun
```

Examples:

- Publish Product
- Analyze Market
- Generate Daily Report
- Process Order

---

# 6. Architecture Principles

The following rules are mandatory.

## Rule 1

Business logic belongs to Agents.

---

## Rule 2

Coordinator never performs business logic.

Coordinator only:

- schedules
- routes
- retries
- monitors

---

## Rule 3

Agents never call other Agents directly.

Communication happens through events and workflows.

---

## Rule 4

Business knowledge is platform independent.

Platform-specific logic belongs to adapters.

---

## Rule 5

Everything should be event-driven whenever practical.

---

# 7. Git Standards

Default branch:

```
main
```

Commit messages follow Conventional Commits.

Examples:

```
feat:
fix:
docs:
refactor:
test:
style:
chore:
```

Every Milestone ends with one Git Commit.

---

# 8. Review Standards

Every document has four states.

```
Draft

↓

In Review

↓

Approved

↓

Released
```

No implementation starts before approval.

---

# 9. AI Development Rules

Every AI assistant participating in this project must follow these rules.

Before writing code:

1. Read README
2. Read Vision
3. Read Engineering Standards
4. Read related Specifications

AI must never invent architecture.

If architecture is unclear,

stop and request clarification.

---

# 10. Definition of Done

A task is considered complete only when:

- Documentation updated
- Specification approved
- Code implemented
- Tests passed
- Review completed
- Git committed

Missing any step means the task is not complete.

---

# 11. Engineering Philosophy

Prefer consistency over cleverness.

Prefer maintainability over short-term speed.

Prefer explicit design over hidden assumptions.

The repository should remain understandable even after ten years.

---

# Engineering Statement

AI Commerce OS is developed as a long-term software engineering project.

Every design decision should improve the maintainability, scalability and reliability of the system.

Engineering discipline is a feature of the product.