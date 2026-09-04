# ADR-0008: AI Agent Product Principle V1

## Status

Accepted and frozen.

## Principle

**Agent = Model + Skills + Workflow + Tools + Memory + Execution Engine**

- Model provides the intelligence source.
- Skills define what an Agent can do.
- Workflow defines how multiple Skills are sequenced; Workflow is not a Skill.
- Tools define which external capabilities an Agent can call.
- Memory defines what the Agent persists and restores over time.
- Execution Engine performs engineering or external actions.

Founder manages Agents and the six product-level parts above. Founder does not directly manage Capability Registry, Runtime Resolver, Provider keys, or internal execution state. Capabilities and runtimes remain internal implementation contracts. A Skill may be implemented by one or more Capabilities; therefore **Skill is not Capability**.

The same structural contract applies to every future Agent. The only currently registered Founder AI Agent is `sino_founder_ai` (Sino AI 秘书). No future Agent, Skill, Workflow, or Tool is created until its runtime exists.

Goal Reasoning remains an internal runtime and is presented through Sino's Reasoning Skill. Multi-Model Discussion is a Skill. Code execution remains a separate execution area with a selectable system model and an Execution Engine resolved from the Execution Engine Registry.
