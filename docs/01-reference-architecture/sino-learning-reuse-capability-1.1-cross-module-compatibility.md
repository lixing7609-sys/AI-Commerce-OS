# Sino Learning & Reuse V1 — Capability 1.1 Cross-Module Compatibility

Status: VERSIONED COMPATIBILITY EXTENSION

Baseline extended: Capability 1 — Reusable UI Interaction Pattern Asset

## Purpose

Capability 1.1 separates three concepts that the legacy `semantic_module` value could otherwise conflate:

1. **Source provenance** — where the verified pattern was learned.
2. **Applicability domain** — where its advisory behavior and verification guidance may be reused.
3. **Current task write scope** — the modules and files the current task is authorized to change.

The persisted `semantic_module` column remains unchanged and is interpreted as the source provenance module. Exact source-module affinity is a ranking signal, not a mandatory compatibility condition.

## Compatibility contract

The first versioned profile covers `ui_interaction_pattern / anchored_portal_popover`. Same-module or cross-module reuse may be `PASS` only when all of the following are true:

- the current semantic target is resolved with HIGH confidence;
- the current module belongs to the explicitly supported compact Founder UI interaction domain;
- an applicable Decision selected `anchored_popover`, or the current task explicitly requires that interaction;
- the task has a visible contextual trigger and compact action set;
- current risk is LOW;
- no large workspace, destructive confirmation, full-screen/mobile-sheet, explicit-modal, or incompatible-accessibility invalidation is present;
- the historical asset remains advisory and has no scope, risk, or completion authority;
- current semantic scope is identical before and after reuse injection;
- historical source files are not added to write scope or Relevant Files.

This is not a wildcard for all Founder UI. Asset kind, pattern type, supported domain, interaction intent, risk, reuse conditions, and invalidation conditions remain deterministic gates.

## Legacy assets and storage

No database table, migration, row update, or asset bootstrap is required. Assets without a materialized `applicability_profile` receive a deterministic runtime profile inferred from their asset kind, pattern type, reuse conditions, invalidation conditions, and payload. The inferred profile is exposed with the asset projection and reuse evidence.

## Scope and authority safety

Historical production artifacts are provenance evidence only. Task Package injection may project behavior guidance, verification guidance, constraints, applicability information, and asset references; it must not inject historical file paths into current discovery or write scope.

Capability 1's frozen authority contract remains unchanged:

- `scope_authority = false`
- `risk_authority = false`
- `completion_authority = false`

All other Capability 1 frozen baseline rules remain in force.

## Regression command

```bash
./scripts/test-sino-learning-reuse-cross-module
```
