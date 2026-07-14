# DEP-002 Local Development

# Metadata

Version

1.0

Status

Draft

Owner

Chief Infrastructure Architect

Domain

Deployment

---

# 1. Purpose

This document defines the standard local development environment for AI Commerce OS.

The objective is to ensure every developer workstation follows a consistent architecture, tooling and deployment process.

---

# 2. Target Architecture

Development Platform

- macOS (Apple Silicon)
- Docker Desktop
- VS Code
- Claude Code

Runtime Services

- FastAPI
- n8n
- PostgreSQL
- Redis
- Ollama

Development Tools

- Git
- Python
- uv
- Node.js
- pnpm

---

# 3. Directory Structure

- Source Code
- Documentation
- Docker Configuration
- Environment Files
- Logs
- Scripts

---

# 4. Software Requirements

- Docker Desktop
- Git
- VS Code
- Claude Code
- Python 3.12+
- Node.js LTS
- uv
- pnpm

---

# 5. Configuration

Environment variables are stored in:

- .env.local
- .env.example

No production secrets are stored locally.

---

# 6. Deployment Procedure

1. Clone repository.
2. Configure environment variables.
3. Start Docker services.
4. Verify runtime health.
5. Launch development services.

---

# 7. Verification Checklist

- Docker running
- PostgreSQL available
- Redis available
- n8n available
- FastAPI available
- Ollama available

---

# 8. Rollback Procedure

- Stop containers
- Restore previous configuration
- Restart services
- Verify health status

---

# 9. Future Extensions

- Dev Containers
- Remote Development
- GPU Support
- Multi-node Local Cluster

---

# References

DEP-001 Environment Architecture

DEP-003 Docker Compose

DEP-005 CI/CD Pipeline