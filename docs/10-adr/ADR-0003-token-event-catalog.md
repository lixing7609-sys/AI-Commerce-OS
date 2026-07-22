---
document_id: ADR-0003-EVENT-CATALOG
title: AI Token Economy — Event Catalog
version: 1.0.0
status: Accepted
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-22
---

# ADR-0003 Token Event Catalog

Companion to [ADR-0003-ai-token-economy.md](ADR-0003-ai-token-economy.md) and
[ADR-0003-token-domain-model.md](ADR-0003-token-domain-model.md). Defines the Business Events for
the Token domain, following the naming convention, event categories, and metadata envelope
already established by `docs/01-reference-architecture/RA-003-event-architecture.md` — no new
event format is invented.

All Token accounting events are kept under the **`Token.`** domain (not a separate `Balance.`
domain), per `Domain.Action` naming. `Pricing.SnapshotPublished` is the one exception, living in
its own `Pricing.` domain since a pricing snapshot is conceptually shared infrastructure, not a
per-account Token event.

**RMB refunds are explicitly not in this catalog.** A refund of an operator's payment is a
billing-domain event, not a Token event — see ADR-0003-token-domain-model.md §4. It is referenced
here only as a boundary note, not defined.

---

## Metadata envelope (reused from RA-003 §7, unchanged)

Every event below carries: Event ID, Trace ID, Correlation ID, Tenant ID (Business Cell),
Store ID (where applicable), Platform (where applicable), Source Component, Timestamp, Version,
Priority — plus the Token-specific payload fields listed per event. Metadata never contains
business logic, per RA-003.

---

## Event catalog

| Event | RA-003 Category | Trigger | Conceptual payload (in addition to the standard envelope) | Idempotency scope (per domain model §5) | May be emitted by |
|---|---|---|---|---|---|
| `Token.Granted` | Human (manual/promotional/compensation grant) or System (automatic plan-included grant) | A `TokenGrant` is issued, creating a new `TokenLot` | account ID, lot ID, source type, amount, expiration (if any), plan/pricing version | Business Cell + explicit grant reference (manual/promotional/compensation) **or** Business Cell + plan/billing-period identity (automatic plan-included) | Operator Cloud admin action (manual/promotional/compensation); Runtime scheduler (plan-included, automatic) |
| `Token.PurchaseCredited` | Internal (Runtime reacts to a billing-domain confirmation; may be reclassified once the billing domain's own event catalog exists) | A `TokenPurchaseCredit` is recorded after an external billing/payment record confirms | account ID, lot ID, amount, external billing-record reference (ID only, no payment details), pricing/plan version | Business Cell + external billing/payment reference | Billing-domain integration point (reacting to payment confirmation) |
| `Token.Reserved` | Internal | A task-level `TokenReservation` envelope is opened | account ID, task ID, reservation ID, reserved amount (estimate) | Business Cell + business task + attempt | Coordinator, on task dispatch |
| `Token.AdditionalAuthorizationRequested` | Internal | Actual usage within an open envelope trends above the original reserved amount | reservation ID, additional amount requested, running actual-vs-reserved delta | Business Cell + reservation identity + attempt | Runtime, mid-task |
| `Token.UsageLineRecorded` | Internal | An actual provider/model call completes; its actual usage is **durably recorded** — this does **not** charge or settle Token (see domain model §3.1) | reservation ID, usage line ID, provider request ID, model, input/output usage, cost-map version, attempt | Business Cell + business task + provider request ID + attempt | Agent, immediately after a provider call returns |
| `Token.ReservationReleased` | Internal | A task fails or completes before consuming (some or all of) its reservation | reservation ID, released amount | Business Cell + reservation identity | Coordinator, on task failure/completion path |
| `Token.Consumed` | Internal | **The canonical Token settlement event.** Settles one or more previously recorded, not-yet-settled usage lines; may fire per phase for async/partial settlement. Each usage line is referenced by at most one `Token.Consumed` unless later corrected by `Token.ConsumptionReversed` (domain model §3.1) | reservation ID, consumption record ID, the specific usage line IDs being settled in this phase, pricing snapshot ID, settled amount | Business Cell + business task + settlement/phase identity, referencing the specific usage line IDs settled | Coordinator, on (partial or full) settlement |
| `Token.ConsumptionReversed` | Human (typically a reviewed correction) or System (automated defect detection) | A settled `TokenConsumptionRecord` requires a compensating correction | original consumption record ID, reversal ledger entry ID, amount, reason, actor (if human), audit reference | Business Cell + reference to the original settlement being corrected + reason | Operator Cloud admin action; or an automated reconciliation process flagging a defect |
| `Token.ConsumptionRejected` | Internal | An attempted reservation or additional authorization cannot be covered by available balance/lots | account ID, task ID, requested amount, available amount at rejection time | Business Cell + business task + attempt (same scope as the reservation/authorization attempt that was rejected) | Coordinator, at the point balance is checked |
| `Token.Adjusted` | Human | A manual correction outside the normal reserve/settle flow | account ID, lot ID (if applicable), amount, reason, actor, timestamp, audit reference | Business Cell + audit reference (the audit reference is itself the idempotency key) | Operator Cloud admin action only |
| `Token.LotExpired` | System | A `TokenLot`'s expiration is reached with remaining balance | lot ID, expired amount | Business Cell + lot identity + expiration run/date | Runtime scheduler (lifecycle process) |
| `Pricing.SnapshotPublished` | Human | A new `PricingSnapshot` (model/provider → Token cost mapping) is published | pricing snapshot ID, version, effective-from timestamp | Snapshot version (not Business Cell-scoped — shared infrastructure) | Operator Cloud admin action only |

---

## Notes

- **`Token.UsageLineRecorded` is not settlement.** It durably records that provider/model usage
  happened — no Token is charged or reserved-amount deducted when it fires. **`Token.Consumed` is
  the canonical settlement event** — it is the only event in this catalog that actually settles
  Token, and it does so by referencing one or more already-recorded, not-yet-settled usage lines.
  A given usage line is referenced by settlement at most once; a later correction to already-
  settled usage is always a `Token.ConsumptionReversed` compensating entry, never a second
  `Token.Consumed` covering the same line and never a mutation of the original
  `Token.UsageLineRecorded` fact. This repository does not need a separate
  `Token.UsageLineSettled` event — `Token.Consumed` fills that role — but the mapping between the
  two events is exactly as stated here and in the domain model's §3.1.
- `Token.Reserved` and `Token.Consumed` are explicitly **not** a 1:1 pair — a single reservation
  may produce zero or more `Token.UsageLineRecorded` events and one or more `Token.Consumed`
  (phased settlement) events, per the domain model's reserve/settle lifecycle (§3, §3.1).
- `Token.ConsumptionReversed` and `Token.ConsumptionRejected` are distinct: a *rejection* means an
  attempted operation never happened; a *reversal* means a settled operation is being corrected
  after the fact. Neither is named "refund," per the domain model's three-way
  release/reversal/RMB-refund separation (§4).
- Idempotency scopes in the table above follow the unified, per-operation-family framework defined
  in the domain model §5 — not a single reused `(source, request_id)` tuple. Provider callback
  retries are covered by the "Usage recording" and "Settlement" rows of that framework, so a
  retried provider call cannot duplicate a `Token.UsageLineRecorded` or double-fire
  `Token.Consumed` for the same usage.
- No event in this catalog ever carries RMB payment details (card numbers, gateway references
  beyond an opaque billing-record ID, etc.) — consistent with `TokenPurchaseCredit` never
  embedding payment details (ADR-0003-ai-token-economy.md, strict three-way separation).

---

## References

- [ADR-0003-ai-token-economy.md](ADR-0003-ai-token-economy.md) — parent decision.
- [ADR-0003-token-domain-model.md](ADR-0003-token-domain-model.md) — entities and lifecycle these
  events correspond to.
- `docs/01-reference-architecture/RA-003-event-architecture.md` — event naming convention,
  categories, and metadata envelope reused here without modification.
