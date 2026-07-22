---
document_id: ADR-0003-DOMAIN-MODEL
title: AI Token Economy — Domain Model
version: 1.0.0
status: Accepted
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-22
---

# ADR-0003 Token Domain Model

Companion to [ADR-0003-ai-token-economy.md](ADR-0003-ai-token-economy.md). Defines the conceptual
entities, relationships, state machines, and invariants of the Token accounting domain.
**Conceptual only — no SQL, no migration, no implementation.** Numbers (prices, ratios, expiry
durations) are out of scope per the parent ADR's Explicit Non-Goals.

---

## 1. Ledger as sole source of truth

`TokenLedgerEntry` is the authoritative, append-only record of everything that happens to a Token
account. Every recharge, grant, reservation, consumption, release, reversal, expiration, or manual
adjustment exists **only** as a ledger entry — nothing may edit a balance or lot field directly.

Requirements:

- Ledger entries are **append-only**; historical entries are never overwritten.
- Corrections are made via **compensating/reversal entries**, never edits to an existing entry.
- `TokenAccount.available_balance` and `TokenAccount.reserved_balance` are **projections/cached
  aggregates computed from the ledger** — not independently authoritative. `reserved_balance` is
  the canonical English term for Token currently held by open reservations (informally
  "frozen"); Chinese-language material may gloss it as 预留/冻结额度, but the conceptual model uses
  this one English name throughout, not a mix of "frozen" and "reserved."
- Account balances must be **reconstructable from ledger entries alone** (i.e. replayable from an
  empty projection).
- Cached balances require periodic **reconciliation** against the ledger; a mismatch between a
  cached balance and the ledger-derived value is a defect to detect and fix, not a state the
  system tolerates.

---

## 2. Token lots — source and expiry preserved, never merged

Purchased, plan-included, promotional, compensation, and manually granted Token must not lose
their origin by being merged into one anonymous balance. `TokenLot` tracks each batch:

- Source type: `purchased` / `plan_included` / `promotional` / `compensation` / `manually_granted`.
- Original amount (at issuance).
- Issued time.
- Optional expiration.
- The pricing/plan version active when issued.
- A grant/purchase reference (linking to the `TokenGrant`/`TokenPurchaseCredit` event that created
  it, and in the purchased case, to the external billing-record ID — never to payment details
  themselves).
- Allocation metadata linking the lot to the ledger entries that created and have consumed it.

**`TokenLot.remaining_amount` is itself a projection, not a second source of truth.** It is
derived from immutable ledger allocation entries — never independently authoritative, and never
directly edited to perform consumption, expiration, release, or adjustment. Three layers must
reconcile at all times:

1. Account-level available/reserved projections.
2. Per-lot remaining projections.
3. The immutable `TokenLedgerEntry` records underneath both (1) and (2).

A lot's "remaining" figure is exactly as derived, and exactly as reconstructable by replay, as the
account balance is — there is one source of truth (the ledger), expressed at two levels of
aggregation (account, lot), never two independent sources of truth.

Exact expiry periods are not decided by this document. Expiry **must be tracked per lot**, and
consumption **must follow a deterministic order** — provisionally **earliest-expiring-first**
(lots with no expiration are consumed last).

---

## 3. Reserve vs. settle lifecycle, with provider-call-level metering preserved

A business task receives a task-level **reservation/authorization envelope** — this is explicitly
**not** the same as one indivisible task-level settlement.

Within that envelope:

- **Every actual provider/model call produces its own independently identifiable metered usage
  line** — `TokenMeteredUsageLine` — carrying: provider request ID, model, actual input/output
  usage, the cost-map version used, and attempt number. See §3.1 for exactly what "recorded" and
  "settled" mean for a usage line — they are not the same moment.
- Usage lines may be **aggregated** into task-level settlement and reporting, but aggregation must
  **never erase** provider-call-level usage, cost, audit, or idempotency data — line-level detail
  survives underneath the aggregate the same way ledger entries survive underneath account/lot
  projections.
- **Phased/partial settlement is allowed** when providers complete asynchronously — a task with
  three provider calls may settle usage line 1 while lines 2–3 are still pending.
- The task-level reserved amount is an **estimate-based pre-authorization**; actual aggregate
  consumption at settlement may be **lower or higher** than the estimate.
- A **released remainder** when actual < reserved.
- An **optional additional authorization** step when actual is trending above the original
  envelope (a task's calls collectively exceeding the initial estimate) — this is a new
  authorization request against the account, not a silent overdraw.
- **Partial success**: some provider calls succeed and produce recorded usage lines before a
  later call fails.
- **Retries**: a retried attempt must not duplicate a usage line, double-reserve, or double-settle
  — enforced by the idempotency framework (§5), keyed per operation family (usage recording,
  settlement, etc.).
- **No implicit negative balance** under any of the above: an authorization shortfall is an
  explicit rejected/pending state, never a balance that silently goes negative.

### 3.1 `TokenMeteredUsageLine` lifecycle — recording is not settlement

Recording and settlement are two distinct facts about a usage line, and must not be conflated:

- **`Token.UsageLineRecorded` means provider/model usage was durably recorded.** It does **not**
  mean Token was charged or settled. A usage line is created the moment a provider/model call
  completes and its actual usage is known — this is a factual capture of what happened, with no
  Token movement yet.
- **`Token.Consumed` is the accounting settlement event** — the only event that actually causes a
  ledger-level Token deduction. A single `Token.Consumed` settlement (producing one
  `TokenConsumptionRecord`) may include **one or more** previously recorded
  `TokenMeteredUsageLine`s.
- **One business task may have multiple partial settlements.** Its reservation envelope may see
  several `Token.Consumed` events over its lifetime, each covering a disjoint subset of that
  task's recorded usage lines (the phased/async case above).
- **A usage line's "settled" status is itself a projection, not a directly-written field** —
  consistent with the ledger-as-source-of-truth principle in §1 and the lot-projection principle
  in §2. A usage line is "settled" if and only if some `TokenConsumptionRecord` references it.
  Nothing ever writes "settled" onto a usage line directly.
- **Each usage line may be settled at most once**, unless a later compensating reversal is
  recorded. A usage line already referenced by one `TokenConsumptionRecord` cannot be referenced
  by a second, independent settlement — the only way to change its economic effect afterward is a
  `Token.ConsumptionReversed` compensating entry that references the original settlement (§4),
  never a second settlement of the same line.
- **Provider callback retries must not duplicate usage lines or settlement.** If a provider call
  is retried (e.g. a client-side timeout followed by a retry that also eventually returns), this
  must resolve to exactly one `TokenMeteredUsageLine` and, later, at most one settlement reference
  to it — enforced by the idempotency framework's "Usage recording" and "Settlement" scopes (§5).
- **Correcting settled usage never mutates the original usage-line fact.** Once recorded, a
  `TokenMeteredUsageLine`'s captured usage is immutable, exactly like a `TokenLedgerEntry` (§1).
  A correction is always a new compensating/reversal record referencing the original — never an
  edit to what was actually recorded as having happened.

This is not adding a new event: `Token.UsageLineRecorded` (recording) and `Token.Consumed`
(settlement) remain the only two events in this part of the lifecycle — see the event catalog's
Notes section for the explicit event-level statement of this same mapping.

### State machine (per task-level envelope)

```
                 ┌──────────────────────────┐
                 │   Reservation Requested   │
                 └────────────┬─────────────┘
                              │  sufficient balance/lots available
                              ▼
                    ┌───────────────────┐
                    │      Reserved      │◄────────────────┐
                    └─────────┬──────────┘                  │
             task fails       │  provider call(s) execute    │ additional
             before any       │                              │ authorization
             usage line       ▼                              │ requested
                    ┌────────────────────────┐               │
        ┌──────────►│ Usage Line(s) Recorded │───────────────┘
        │           │ (durable fact only —   │
        │           │  no Token movement yet;│
        │           │  may repeat per call,  │
        │           │  phased/async)         │
        │           └───────────┬────────────┘
        │                       │ one or more recorded lines are settled
        │                       ▼
        │           ┌───────────────────────┐
        │           │  Task-Level Consumed    │  (Token.Consumed — the actual settlement;
        │           │  (settlement of one or  │   may repeat for further phases, each
        │           │  more usage lines)      │   settling a disjoint set of lines)
        │           └───────────┬────────────┘
        │                       │ post-settlement correction needed
        │                       ▼
        │           ┌───────────────────────┐
        │           │  Consumption Reversed   │  (compensating entry referencing the
        │           │                         │   original settlement, never an edit)
        │           └───────────────────────┘
        ▼
┌───────────────────┐
│ Reservation Released│  (pre-settlement failure; unused/unneeded amount returned)
└───────────────────┘
```

---

## 4. Three distinct "money coming back" concepts — never conflated as "refund"

- **Release** (before settlement) — an unused or unneeded reservation is returned to available
  balance (e.g. the task failed before consuming anything). Not a ledger reversal; simply closes
  an open reservation.
- **Reversal / compensating entry** (after settlement) — a correction to already-settled
  consumption, recorded as a new compensating `TokenLedgerEntry`. Never an edit to the original
  settled record.
- **RMB refund** — belongs entirely to the separate payment/billing domain (money returned to the
  operator's payment method). This domain model does **not** define RMB refunds. It only notes
  that a `TokenPurchaseCredit` entry may reference a billing record that is later refunded, and
  that refund triggers a billing-domain process — never a Token ledger event.

These three are structurally different operations on different domains and must never share a
name, a code path, or an event type.

---

## 5. Idempotency — a unified framework of operation-specific identity scopes

The existing `(source, request_id)` deduplication pattern used for external task submission
(`backend/app/core/external_task_auth.py` / `backend/app/api/v1/integrations.py`) is cited here
as **precedent for the pattern** — not as a sufficient, one-size-fits-all key for Token
accounting. Token accounting covers more than task execution (grants, purchases, expirations,
manual adjustments, pricing publication), and each of those operation families has its own
natural business-unique reference. This section defines **one common framework** — every
Token-affecting operation is idempotent, scoped by Business Cell where applicable, keyed by an
operation-appropriate business-unique reference — expressed as **per-operation-family identity
scopes**, not one universal `(source, request_id)` tuple and not one oversized compound key that
tries to cover every operation type at once.

### Operation-specific identity scopes

| Operation family | Business-unique reference (idempotency key) | Notes |
|---|---|---|
| Task reservation | Business Cell + business task + attempt | A retried reservation request for the same task/attempt returns the original reservation. |
| Usage recording | Business Cell + business task + provider request ID + attempt | One provider request produces at most one `TokenMeteredUsageLine`; a retried provider callback for the same provider request ID must not create a second line. |
| Settlement | Business Cell + business task + settlement/phase identity, referencing the specific usage line IDs it settles | A retried settlement call for the same phase returns the original `TokenConsumptionRecord`; a usage line already referenced by a settlement cannot be settled again by a different one (see §3.1). |
| Release | Business Cell + reservation identity | Idempotent per reservation — a reservation can be released at most once, and never after it has been settled. |
| Reversal | Business Cell + reference to the original settlement/ledger entry being corrected + reason | A retried reversal request for the same original entry and reason returns the original reversal, never creates a duplicate compensating entry. |
| Purchased Token credit | Business Cell + external billing/payment reference | The billing/payment record ID (opaque, no payment details) is the natural business-unique reference; a duplicate billing webhook/callback for the same reference must not create a second `TokenPurchaseCredit`. |
| Promotional / compensation / manual grant | Business Cell + an explicit grant reference assigned by the issuer (e.g. an admin-supplied key, or a campaign+recipient reference) | The issuer is responsible for supplying a stable reference; retried grant submissions with the same reference return the original grant. |
| Plan-included (automatic) grant | Business Cell + plan/billing-period identity | One grant per Business Cell per billing period; re-running the automatic grant process for a period that's already granted is a no-op. |
| Token lot expiration | Business Cell + lot identity + expiration run/date | An expiration sweep must be safely re-runnable without double-expiring a lot that has already been fully expired. |
| Manual adjustment | Business Cell + audit reference | The audit reference *is* the idempotency key — a retried adjustment submission with the same audit reference returns the original adjustment, never creates a second one. |
| Pricing snapshot publication | Snapshot version (not Business Cell-scoped — shared infrastructure) | Publishing the same version twice is a no-op that returns the original snapshot. |

### Framework-wide rules

- **Idempotency is scoped by Business Cell where applicable.** Operations that are inherently
  cross-tenant (pricing snapshot publication) are scoped by their own shared identity instead;
  every other operation family is scoped within one Business Cell and never collides across
  tenants.
- **A retry returns the original result whenever the accounting fact already exists.** This is
  not "silently succeed with no output" — the retry must produce the same response the original
  successful attempt produced (the same reservation, the same settlement record, the same
  adjustment), so the caller cannot tell, from the response alone, whether this was the first
  attempt or a retry.
- **Duplicate external callbacks must never create duplicate ledger entries.** A billing webhook,
  a provider callback, or any other external notification that fires more than once for the same
  underlying event must resolve to the same `TokenLedgerEntry`, not a second one.
- **The system must distinguish "operation never committed" from "operation committed but the
  response was lost."** The first case is safe to retry as a fresh attempt; the second must
  return the already-committed result rather than re-executing. This requires the
  operation-specific business-unique reference (not the HTTP transport layer) to be checked
  *before* any side effect becomes visible, so a retry can always determine which case it's in.
- **HTTP request IDs alone are insufficient.** A request ID is a transport-layer detail — useful
  for logging and tracing, but it does not capture business intent and is not, by itself, an
  idempotency key. The business-unique references in the table above are what determine whether
  two attempts refer to the same accounting fact; request IDs may be recorded alongside them for
  observability, never used in place of them.

A retried reservation, a retried settlement, and a retried reversal are each safely idempotent on
their own terms — under their own operation-specific scope in the table above — without
collapsing into each other or into an unrelated operation family's key.

---

## 6. Entities

| Entity | Role |
|---|---|
| `TokenAccount` | Owner = Business Cell. `available_balance`/`reserved_balance` are projections over the ledger, not authoritative. |
| `TokenLedgerEntry` | Append-only, sole source of truth for every balance-affecting event. |
| `TokenLot` | Source/expiry-tracked batch. `remaining_amount` is a projection over ledger allocation entries, not independently authoritative. |
| `TokenGrant` | The originating record for a promotional/plan-included/manually-granted lot. |
| `TokenPurchaseCredit` | The originating record for a purchased lot. References an external RMB billing/payment record by ID; **never embeds payment details**. Named explicitly (not `TokenPurchase`) to make clear it only records the resulting Token credit, not the purchase transaction itself. |
| `TokenReservation` | The task-level authorization envelope. |
| `TokenMeteredUsageLine` | One per actual provider/model call: provider request ID, model, actual input/output usage, cost-map version, attempt. Recorded once, immutable; whether it is "settled" is a projection (§3.1) — true iff some `TokenConsumptionRecord` references it — never a directly-written field. |
| `TokenConsumptionRecord` | Task-level settlement aggregating one or more usage lines. References the `PricingSnapshot` active at settlement. Never discards the usage lines it aggregates. |
| `TokenAdjustment` | Manual correction. Mandatory reason + actor + timestamp + audit reference. |
| `PricingSnapshot` | Model/provider → Token cost mapping, versioned, immutable once referenced by any consumption record. |
| `AuditLogEntry` | Audit trail entry, required for every `TokenAdjustment` and referenced by reversal entries. |

---

## 7. Relationship to existing entities

- `TokenAccount.owner` → the existing **Business Cell** tenant boundary (`DB-013-multi-tenant-strategy.md`),
  not a new ownership concept.
- `TokenMeteredUsageLine` formalizes the `LLMUsage`/`usage` dict already captured today by
  `backend/app/agents/{ai_ceo_agent,product_agent,sales_agent}.py` from
  `backend/app/llm/models.py`'s `LLMUsage(input_tokens, output_tokens, total_tokens)` — this
  document promotes that existing signal to a first-class record; it does not redesign the LLM
  gateway.
- `TokenReservation`/`TokenConsumptionRecord` conceptually attach to the existing `tasks` table
  (`backend/app/models/task_db.py`) via task ID — no schema change is made or proposed here.

---

## 8. Invariants (restated from the parent ADR's Accounting Invariants)

1. Token balance can never silently become negative.
2. `available + reserved` must always reconcile with ledger state.
3. Settled consumption is immutable; corrections are new compensating ledger entries.
4. Every manual adjustment requires reason, actor, timestamp, and an audit reference.
5. Every consumption record references the exact pricing snapshot used at settlement time.
6. Advertising cash can never automatically convert to or from Token.
7. Token cannot be transferred between operators/tenants unless a future ADR explicitly allows it.
8. Deleting a task must never delete its accounting history.

Restated here for implementation clarity and cross-referenced to the governing ADR — the
authoritative statement of these invariants is
[ADR-0003-ai-token-economy.md](ADR-0003-ai-token-economy.md#accounting-invariants); this section
is a copy for readers of the domain model who need them without switching documents, not a second
independent definition.

---

## References

- [ADR-0003-ai-token-economy.md](ADR-0003-ai-token-economy.md) — parent decision.
- [ADR-0003-token-event-catalog.md](ADR-0003-token-event-catalog.md) — companion event catalog.
- `docs/05-database/DB-013-multi-tenant-strategy.md` — Business Cell tenant boundary.
- `backend/app/llm/models.py`, `backend/app/agents/{ai_ceo_agent,product_agent,sales_agent}.py` —
  existing `LLMUsage` capture this model formalizes.
- `backend/app/core/external_task_auth.py`, `backend/app/api/v1/integrations.py` — idempotency
  pattern cited as precedent in §5.
