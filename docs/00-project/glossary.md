---
document_id: DOC-004
title: Project Glossary
version: 1.0.0
status: Draft
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-01
---

# AI Commerce OS Glossary

> This document defines the official language used throughout AI Commerce OS.
>
> Every document, specification, workflow, database schema and AI Agent must use these definitions consistently.

---

# 1. Business Terms

## Brand

A commercial identity presented to customers.

A single entrepreneur may operate multiple Brands.

Example:

- LightOS
- HomeOS
- FreshLife

---

## Store

A sales entity on a commerce platform.

Examples:

- Douyin Store
- Taobao Store
- Amazon Store

One Brand may own multiple Stores.

---

## Platform

A third-party commerce ecosystem.

Examples:

- Douyin
- Taobao
- JD
- Pinduoduo
- Amazon
- Shopee

Platforms are accessed only through Platform Adapters.

---

## Product

A sellable business offering.

A Product is platform-independent.

Different platforms may represent the same Product differently.

---

## SPU

Standard Product Unit.

Represents the abstract product definition.

Example:

LED Strip Light 5M

---

## SKU

Stock Keeping Unit.

Represents a purchasable inventory item.

Different colors, sizes or specifications create different SKUs.

---

## Inventory

The quantity of available SKUs.

Inventory belongs to AI Commerce OS, not to any platform.

---

## Supplier

A person or company providing products.

Suppliers are managed independently of commerce platforms.

---

## Customer

The buyer of products.

Customers originate from platforms but are treated as business entities inside AI Commerce OS.

---

## Order

A completed purchasing transaction.

Orders are synchronized from platforms into the internal Order model.

---

# 2. AI Terms

## Agent

An autonomous software component responsible for one business capability.

Examples:

- Product Agent
- Pricing Agent
- Inventory Agent
- Customer Service Agent

Each Agent owns one responsibility.

---

## Coordinator

The orchestration component of the system.

Responsibilities:

- Scheduling
- Routing
- Retry
- Monitoring

The Coordinator never owns business logic.

---

## Workflow

A sequence of business activities triggered by an event.

Workflows coordinate Agents.

Agents execute business logic.

---

## Task

A single executable unit inside a Workflow.

Example:

Generate Product Description

---

## Job

A scheduled background execution.

Examples:

Daily Report

Nightly Inventory Check

Competitor Scan

---

## Policy

A configurable business rule.

Examples:

Maximum Price Adjustment

Manual Approval Threshold

Customer Reply Strategy

Policies should be configurable rather than hard-coded.

---

## Knowledge Base

The persistent business knowledge available to AI.

Includes:

- Product knowledge
- Supplier knowledge
- Customer knowledge
- Platform knowledge

---

## Prompt

Instructions provided to an LLM.

Prompts are version-controlled project assets.

---

## Memory

Context retained by AI across executions.

Memory may be:

- Short-term
- Long-term

---

## Tool

An external capability invoked by AI.

Examples:

- DeepSeek API
- PostgreSQL
- Redis
- Qdrant
- n8n
- OCR

---

# 3. Architecture Terms

## Specification

A document describing what a component must do.

Specifications are implementation-independent.

---

## Reference Architecture

A document describing the recommended implementation approach.

Reference Architecture may reference technologies.

---

## Architecture Decision Record (ADR)

A permanent record of an architectural decision.

ADRs preserve important design decisions.

---

## Domain

A logical business boundary.

Examples:

Product Domain

Inventory Domain

Order Domain

---

## Adapter

A component translating between AI Commerce OS and external systems.

Examples:

Douyin Adapter

Amazon Adapter

ERP Adapter

---

## Milestone

A development phase with a clearly defined goal.

Each Milestone ends with a Git Commit.

---

# 4. Event Terms

## Business Event

A completed business fact.

Examples:

Order Paid

Inventory Changed

Customer Replied

---

## System Event

An event generated internally.

Examples:

Workflow Started

Workflow Completed

Agent Failed

---

## Command

A request instructing a component to perform an action.

Commands are not facts.

---

## Notification

An informational message.

Notifications do not trigger business decisions.

---

# 5. Platform Principles

All commerce platforms are considered Platform Adapters.

The business model must remain platform-independent.

Adding a new platform should not require changing the business model.

---

# 6. Naming Rules

The following naming rules are mandatory.

| Entity | Rule |
|---------|------|
| Agent | XXX Agent |
| Workflow | Verb + Noun |
| Event | Past Tense |
| Specification | S-XXX |
| ADR | ADR-XXXX |
| Reference Architecture | RA-XXX |
| Document | DOC-XXX |

---

# Glossary Rule

No new business term may appear in any Specification until it has first been defined in this Glossary.