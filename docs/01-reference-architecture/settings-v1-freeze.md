# Settings V1 Freeze

## Purpose

Settings V1 is the Founder-facing control surface for model supply, Sino model assignment, and execution/runtime status. It exposes only persisted configuration, actionable controls, and truthful status.

## Frozen page structure

The single Settings workspace contains, in order:

1. Header: `← 返回首页` and `设置`.
2. Model card grid, including the final Add Model card.
3. A two-column control grid for Sino AI and System.
4. Model Economics for currently assigned models.

On desktop the workspace keeps 100 px viewport margins, with existing responsive reductions on narrower screens. The established header alignment, typography, section order, five-column model grid, and Sino AI/System two-column layout are frozen.

## Frozen interaction model

- Model card → Provider configuration dialog.
- Add Model card → Add AI Model dialog.
- Sino AI control → model assignment dialog.
- System control → executor/runtime/health dialog.

Settings dialogs share the same overlay, focus and close behavior, fixed header, independently scrolling body, and desktop target size of 1100 × 700 px. They shrink to remain within the viewport.

## Responsibility boundaries

- **Models:** Provider credentials and endpoints, model selection, connection checks, health, usage, and cost.
- **Sino AI:** Primary/fallback assignments, Vision, Coding intelligence, and multi-model discussion participation.
- **System:** Executor, runtime registry, system health, and technical runtime detail.

Each mutable setting has one editing surface. Read-only summaries may reference a setting elsewhere, but must not create a second mutation path.

Model Economics is a read-only projection over current persisted Assignment/Runtime references. It deduplicates by Provider plus Model ID, merges all Primary/Fallback and discussion-slot duties, and excludes connected models that have no current assignment. Assignment does not imply usage: request count and completed-call latency come only from persisted model invocation records, Token remains unavailable until it is durably metered into this projection, and cost remains unconfigured until an approved Provider cost or Pricing Rule exists. No estimates or catalog-wide Provider models are permitted.

Provider technical configuration uses one shared layout for every Provider. It contains only a compact connection-control section and the Provider model-management section. Connection status and its test action share one row; the masked API key and update action share one row; Base URL and any real Provider-specific fields are ordinary connection rows. Single-field cards and persistent success cards are prohibited. Successful operations use transient feedback, while model management owns the remaining scrollable dialog space.

Multi-model discussion is a Founder-approved V1 capability extension. It provides five ordered discussion slots; each slot has one optional Primary, one optional Fallback, and operational status derived from the same model health rules as other assignments. Only slots with a configured Primary participate at Runtime. Existing `models` configurations migrate in order to slot Primaries without inventing Fallbacks.

## Change policy

The Settings V1 UI and information architecture are frozen. They may change only when:

1. A new real Runtime capability requires configuration.
2. An existing configuration path becomes invalid.
3. Real usage demonstrates a material interaction defect.
4. The Founder explicitly approves a structural change.

Cosmetic preference, an additional tab, or an extra summary card alone is not sufficient reason to alter this baseline.
