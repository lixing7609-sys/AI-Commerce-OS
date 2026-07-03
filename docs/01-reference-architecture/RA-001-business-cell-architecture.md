# RA-001 Business Cell Architecture

Version: 1.0.0

Status: Approved

Owner: Chief Software Architect

Last Updated: 2026-07-01

---

# 1. Executive Summary

AI Commerce OS is a Local-First, AI-Native Commerce Operating System designed to enable a single entrepreneur to operate multiple commerce businesses through autonomous AI capabilities.

The fundamental architectural unit of the system is the **Business Cell**.

A Business Cell is the smallest independently deployable, independently operable, and independently scalable commerce operating unit.

Each Business Cell contains:

- Business Runtime
- Business Configuration
- Business Policies
- Business Data
- Platform Connections

Business Cells can be replicated horizontally to support business growth without redesigning the system architecture.

---

# 2. Architecture Philosophy

AI Commerce OS is designed around the following philosophy.

## Business First

Business requirements always take precedence over technology choices.

Infrastructure exists to serve business capabilities.

---

## Local First

The default deployment target is local infrastructure.

Cloud services are optional extensions rather than mandatory dependencies.

---

## AI Native

Operational work should be performed by AI whenever practical.

Humans remain responsible for strategic decisions.

---

## Platform Independent

Business logic must never depend on any specific commerce platform.

Platform-specific behavior is isolated through gateways.

---

## Replaceable Infrastructure

Infrastructure components must be replaceable without affecting business logic.

Examples include:

- Workflow Engine
- LLM Provider
- Database
- Cache
- Vector Database

---

# 3. Design Goals

The architecture is designed to satisfy the following goals.

| ID | Goal |
|----|------|
| G-001 | Local First |
| G-002 | AI Native |
| G-003 | Platform Independent |
| G-004 | Replaceable Infrastructure |
| G-005 | Horizontal Scaling |
| G-006 | Human Governance |
| G-007 | High Availability |
| G-008 | Low Operational Cost |

---

# 4. Core Concepts

## 4.1 Business Cell

The Business Cell is the smallest independently deployable commerce operating unit.

A Business Cell owns:

- Runtime
- Policies
- Business Data
- Platform Connections
- Configuration

A Business Cell does not share runtime state with other Business Cells.

---

## 4.2 Business Runtime

Business Runtime is the software responsible for executing business operations.

It is the core executable of AI Commerce OS.

---

## 4.3 Business Brain

Business Brain is responsible for decision making.

Responsibilities include:

- Policy Execution
- Workflow Scheduling
- Knowledge Management
- Business Memory
- AI Coordination

---

## 4.4 Business Capability

A Business Capability represents a reusable business function.

Examples include:

- Product Management
- Pricing
- Publishing
- Customer Service
- Analytics
- Inventory

Capabilities may be implemented by:

- AI
- Rule Engine
- Human Approval

---

## 4.5 Platform Gateway

Platform Gateway is the only component allowed to communicate with external commerce platforms.

Examples:

- Douyin Gateway
- Taobao Gateway
- JD Gateway
- Amazon Gateway

---

# 5. Four-Layer Architecture

AI Commerce OS adopts a fixed four-layer architecture.

```
Business Layer
──────────────────────────────

Business Cell

Business Brain

Business Capabilities

──────────────────────────────

Runtime Layer

Coordinator

Workflow Engine

Event Bus

Agent Runtime

Policy Engine

Knowledge Engine

Monitoring

──────────────────────────────

Infrastructure Layer

PostgreSQL

Redis

Qdrant

Object Storage

LLM

──────────────────────────────

Deployment Layer

Docker

macOS

Mac mini

Linux

Cloud VM

```

Every component in the system must belong to exactly one layer.

---

# 6. Runtime Overview

Business Runtime consists of four logical planes.

## Control Plane

Responsible for orchestration.

Components:

- Coordinator
- Scheduler
- Workflow Engine
- Policy Engine
- Monitoring

---

## Execution Plane

Responsible for business execution.

Contains all business capabilities.

---

## Data Plane

Responsible for persistent storage.

Includes:

- PostgreSQL
- Redis
- Qdrant
- Logs

---

## Integration Plane

Responsible for communication with external systems.

Includes:

- Platform Gateways
- Enterprise WeChat
- Email
- SMS
- Future Integrations

---

# 7. Deployment Model

The default deployment model is Local First.

A typical deployment is:

```
Mac mini

↓

Docker

↓

AI Commerce Runtime

↓

Business Runtime

↓

Business Data
```

Cloud deployment remains supported but is not the primary architecture target.

---

# 8. Scaling Strategy

AI Commerce OS scales horizontally.

The scaling unit is the Business Cell.

Example:

```
Business Cell A

↓

5 Stores

Business Cell B

↓

5 Stores

Business Cell C

↓

5 Stores
```

Business growth is achieved by replicating Business Cells.

---

# 9. Architecture Constraints

The following constraints are mandatory.

AC-001

Business logic shall not depend on infrastructure.

---

AC-002

Platform APIs shall only be accessed through Platform Gateway.

---

AC-003

Agents shall not communicate directly.

---

AC-004

Coordinator performs orchestration only.

It never implements business logic.

---

AC-005

Business Cells must remain independently deployable.

---

AC-006

Infrastructure components must be replaceable.

---

AC-007

All business execution must be event-driven whenever practical.

---

# 10. Future Evolution

The architecture supports future expansion including:

- Local LLM (Ollama)
- Multi-node Business Cells
- Cloud Synchronization
- Cross-Cell Collaboration
- Enterprise ERP Integration
- Warehouse Management Systems
- Financial Systems
- International Commerce Platforms

The Business Cell remains the permanent architectural unit throughout future evolution.

---

# Architecture Statement

AI Commerce OS is a Local-First, AI-Native Commerce Operating System built upon Business Cell Architecture.

Business Cell is the deployment unit.

Business Runtime is the execution unit.

Business Capability is the business abstraction.

Platform Gateway is the integration boundary.

These concepts constitute the architectural foundation of AI Commerce OS.