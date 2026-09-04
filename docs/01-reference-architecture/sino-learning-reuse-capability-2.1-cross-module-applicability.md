# Sino Learning & Reuse V1 — Capability 2.1 Cross-Module Applicability

Status: VERSIONED APPLICABILITY EXTENSION

Baseline extended: Capability 2 — Reusable Decision / Implementation Strategy Asset

## Purpose

Capability 2.1 treats the persisted `semantic_module` as the source provenance module. A Decision Strategy learned in one supported Founder UI module may advise a semantically compatible task in another supported module. Exact source-module affinity improves candidate ranking but does not determine applicability.

## Applicability contract

The first versioned profile covers `decision_strategy / interaction_surface_choice / anchored_overlay_choice`. It is `APPLICABLE` across supported source modules when:

- the current semantic target is resolved with HIGH confidence;
- the task genuinely requires an interaction-surface decision;
- the task has a contextual trigger and compact action set;
- current risk is LOW;
- no large workspace, destructive confirmation, explicit modal, full-screen/mobile-sheet, or incompatible-accessibility invalidation is present.

The recommended strategy remains `anchored_popover`; rejected alternatives remain `drawer` and `modal`. A clear incompatible intent or invalidation produces `NOT_APPLICABLE`. Missing decision factors produce `UNCERTAIN`. The Founder does not need to preselect an interaction surface.

This is not a wildcard for all Founder UI. Strategy type, decision intent, supported applicability domain, current risk, selection conditions, and invalidation conditions remain deterministic gates.

## Provenance, scope, and evidence

Cross-module Decision evidence records the source semantic module, current semantic module, applicability domain, cross-module flag, and before/after scope fingerprints. Historical source modules and files never become current write authority. Semantic target and scope are established before Decision retrieval.

No database migration or historical asset rewrite is required. Legacy `anchored_overlay_choice` assets receive a deterministic runtime applicability profile.

Capability 2's frozen authority contract remains unchanged:

- `scope_authority = false`
- `risk_authority = false`
- `approval_authority = false`
- `completion_authority = false`

Decision remains Why/When; Pattern remains How. Independent current-task verification and the real completion evidence gate remain mandatory.

## Regression command

```bash
./scripts/test-sino-learning-reuse-cross-module
```
