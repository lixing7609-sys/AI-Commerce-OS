# AI Commerce OS

> **One Human. Unlimited AI Employees.**

AI Commerce OS is an AI-native commerce operating system designed to enable a single entrepreneur to operate multiple e-commerce businesses through autonomous AI Agents.

---

# Project Overview

Traditional e-commerce depends on teams.

AI Commerce OS replaces operational departments with autonomous AI Agents.

Instead of hiring:

- Operations
- Customer Service
- Designers
- Copywriters
- Product Managers
- Data Analysts

the entrepreneur only focuses on:

- Product Selection
- Supply Chain
- Business Strategy
- Inventory Preparation
- Shipping

Everything else is executed automatically.

---

# Philosophy

AI Commerce OS is **not** an automation tool.

It is an operating system for commerce.

Every business capability should eventually become an independent AI Agent.

The human makes decisions.

The system executes them.

---

# Vision

The long-term vision is simple.

> **One Human Can Operate Unlimited Commerce Businesses.**

The architecture must allow:

- Multiple Brands
- Multiple Stores
- Multiple Platforms
- Multiple Countries

without redesigning the system.

For the complete project vision, see:

```text
docs/00-project/vision.md
```

---

# Core Principles

The project follows several permanent principles.

### Human First

Humans make strategic decisions.

AI performs repetitive operational work.

---

### AI Native

Business capabilities should be implemented by AI Agents whenever possible.

---

### Event Driven

Everything begins with an event.

Typical events include:

- Product Created
- Product Updated
- Order Paid
- Inventory Changed
- Customer Message Received

Events trigger workflows.

---

### Coordinator Only Orchestrates

The Coordinator never performs business logic.

Its responsibilities are only:

- Scheduling
- Routing
- Retry
- Monitoring

Business logic belongs to individual Agents.

---

### Platform Independent

The core business model should never depend on any specific commerce platform.

Platform-specific logic belongs to adapters.

---

# High-Level Architecture

```
                 Human (CEO)
                       │
                       ▼
            Business Policies
                       │
                       ▼
             AI Coordinator
                       │
          Event-driven Workflows
                       │
────────────────────────────────────────

Opportunity Agent

Product Agent

Pricing Agent

Copywriting Agent

Image Agent

Video Agent

Publishing Agent

Customer Service Agent

Order Agent

Inventory Agent

Analytics Agent

Knowledge Agent

Monitoring Agent

────────────────────────────────────────

Platform Adapters

Douyin

Taobao

JD

Pinduoduo

...
```

Detailed architecture:

```text
docs/01-specification/S-004-coordinator.md
```

---

# Development Roadmap

Current Version

```
v0.1

Milestone 0
Project Skeleton
✅ Completed

Milestone 1
Project Foundation
🚧 In Progress

Milestone 2
Core Architecture

Milestone 3
Business Domains

Milestone 4
AI Agents

Milestone 5
Infrastructure

Milestone 6
Implementation

Milestone 7
MVP Release
```

---

# Repository Structure

```
docs/
src/
workflow/
docker/
configs/
prompts/
scripts/
tests/
assets/
```

---

# Documentation

```
docs/

00-project/

01-specification/

02-domain/

03-agent/

04-database/

05-api/

06-workflow/

07-deployment/

adr/
```

---

# Technology Stack

| Component | Technology |
|------------|------------|
| Language | TypeScript |
| Runtime | Node.js |
| Workflow Engine | n8n |
| Database | PostgreSQL |
| Cache | Redis |
| Vector Database | Qdrant |
| LLM | DeepSeek API |
| Local LLM | Ollama (Future) |
| Container | Docker |
| Reverse Proxy | Caddy / Nginx |
| Host | Mac mini |

---

# Current Status

| Item | Status |
|------|--------|
| Current Phase | Project Foundation |
| Version | v0.1 |
| Development Status | 🚧 Under Development |

---

# Database Setup

Database schema is managed exclusively through Alembic migrations. The backend no longer creates or modifies tables on startup.

Before starting the backend in any new environment, run:

```bash
cd backend
uv run alembic upgrade head
```

---

# License

MIT