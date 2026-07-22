---
document_id: ADR-0003
title: AI Token Economy
status: Accepted
date: 2026-07-22
owner: Chief Software Architect
---

# ADR-0003 AI Token Economy

## Status

Accepted

Independent, top-level architecture decision — not parented under or subordinate to ADR-0002,
unlike ADR-0002A (which is a genuine migration/governance extension of ADR-0002). ADR-0003 sits
at the same tier as the other reserved commercial-architecture slots: ADR-0004 (AI Advertisement
Platform), ADR-0005 (Operator Cloud), ADR-0006 (Commercial Model). It references and supports
ADR-0002 (Operator Edition, whose surface the Token Center will live inside) and ADR-0002A (which
reserved the AI Account / Token Center surface this ADR now defines the accounting rules for),
without being governed by either.

This round is architecture and business-rule definition only. No UI, no database migrations, no
payment integration, and no charging code are implemented here.

---

## Context

ADR-0002 established the Developer/Operator/Device Admin/Operator Cloud Edition boundary.
ADR-0002A's Commercial Architecture Impact section flagged that the future Operator Edition will
need an Ads Center and an AI Account / Token Center, with separate Token and advertising-cash
balances — but explicitly declined to design them, deferring to this ADR.

Before writing this decision, the repository was inspected for any existing concept of Token,
credit, quota, billing, usage metering, recharge, account balance, model cost, advertising
balance, or payment records. The findings are load-bearing for what follows:

**Nothing resembling a Token economy exists in code.** There is no account/balance/ledger table,
no billing table, no quota enforcement, and no payment gateway SDK anywhere in the repository
(`backend/pyproject.toml` and `frontend/package.json` contain zero references to Stripe, Alipay,
WeChat Pay, PayPal, or any other payment channel). There is no Operator Cloud implementation
anywhere. This confirms there is no existing accepted decision on retail pricing, an RMB-to-Token
exchange ratio, package pricing, or a payment channel — so none is invented by this ADR.

**One real, reusable building block already exists.** `backend/app/llm/models.py` defines
`LLMUsage(input_tokens, output_tokens, total_tokens)`, populated from real API responses by both
`backend/app/llm/deepseek_provider.py` and `backend/app/llm/ollama_provider.py`. Three Agents —
`ai_ceo_agent.py`, `product_agent.py`, `sales_agent.py` — already thread this `usage` dict into
their task result payload under the key `"usage"`. This is real, live per-execution metering data
today — but purely descriptive: never aggregated, never tied to an account, a quota, or a price.
This ADR's companion domain model formalizes *promoting* this existing signal into a first-class
metered record; it does not redesign the LLM gateway.

**`LLM_MAX_TOKENS`** (`backend/app/core/config.py`) is a per-request generation cap passed to the
LLM API call. It is a completely different concept from an account-level Token balance and must
not be conflated with it.

**Five naming collisions were found**, all using the word "Token" or "pricing" for something
unrelated to the AI Token Economy defined here — see the Naming Collisions section below.

**The order/payment domain already exists and must stay separate.** `docs/07-api/API-005-order-api.md`,
`docs/04-agent/A-007-order-agent.md`, `docs/05-database/DB-004-order-schema.md`, and
`docs/03-domain/D-003-order-domain.md` already define `payment_status`/`payment_method` fields and
`PaymentSucceeded`/`PaymentFailed` events — but this is the **customer's** payment for a purchase
from the operator's shop. It has nothing to do with the operator's own payment to AI-Commerce-OS
for Token/service usage, which is what "RMB payment and billing records" means in this ADR.

**One aspirational placeholder was found, with zero design.** `docs/05-database/DB-013-multi-tenant-strategy.md`
§10 Future Extensions lists "Tenant-level Billing" as a single bullet — confirming billing was
anticipated but never designed. The same document establishes **Business Cell as the existing
tenant boundary**, which this ADR reuses as the ownership scope for a Token account rather than
inventing a new ownership concept.

**An existing event-architecture precedent was found and is reused.** `docs/01-reference-architecture/RA-003-event-architecture.md`
defines `Domain.Action` event naming (`Order.Paid`, `Inventory.Reserved`), four event categories
(External/Internal/Human/System), and a defined metadata envelope. The companion event catalog
follows this convention rather than inventing a new one.

---

## Problem

How should AI Commerce OS meter and account for its own AI service usage, in a way that:

1. Is strictly separable from advertising cash and from RMB payment/billing records, at both the
   conceptual and data-ownership level;
2. Cannot be mistaken for a virtual currency, a transferable or withdrawable asset, or a promised
   fixed-value financial product;
3. Supports real operational needs — pre-authorization before a task runs, settlement of actual
   usage (which may involve multiple provider calls), refund/reversal on failure, manual
   correction with an audit trail, and reconciliation against actual provider cost — without
   deciding any retail price, exchange ratio, or payment channel prematurely?

---

## Options

### Option A

Track AI usage as a simple running counter per account (increment on use, decrement on top-up),
with no ledger, no per-source tracking, and balances stored and edited directly.

Advantages:
- Minimal conceptual surface area; fast to describe.

Disadvantages:
- No audit trail — a balance is just a number, with no record of how it got there.
- Cannot distinguish a promotional grant from a purchased credit, so expiry and reconciliation
  are impossible to reason about correctly.
- A direct-edit balance is exactly the kind of design that produces silent negative balances,
  double-charges on retry, and unreconcilable numbers once concurrent operations are involved.
- Cannot support partial settlement across multiple provider calls within one task.

### Option B

Define Token as an internal, non-transferable service-usage unit, backed by an immutable,
append-only ledger as the sole source of truth; track Token by lot (source and expiry preserved,
never merged into one anonymous number); support a reserve-then-settle lifecycle with
provider-call-level metering; and keep advertising cash and RMB billing as adjacent but strictly
non-convertible domains.

Advantages:
- Every balance is a reconstructable projection of an auditable history — nothing is ever "just a
  number."
- Cleanly supports partial success, retries, async multi-provider settlement, and manual
  correction without ambiguity.
- The strict three-way separation prevents Token from ever being mistaken for money, and prevents
  advertising cash from silently topping up (or draining) a Token balance.

Disadvantages:
- More conceptual structure to define and eventually implement than a simple counter.
- Requires a companion domain model and event catalog to stay usable (see References).

---

## Decision

Choose **Option B**.

### Strict three-way separation

- **Token service quota** — an internal, non-transferable unit metering AI Commerce OS's own
  compute/service usage. Token is explicitly **NOT**:
  1. A virtual currency.
  2. A freely transferable asset.
  3. A withdrawable balance.
  4. A promised fixed-value financial product.
  5. Advertising money.
- **Advertising cash balance** — funds earmarked for advertising spend on external platforms. A
  financial balance, never Token, never silently convertible to or from Token in either direction.
- **RMB payment and billing records** — the actual movement of money (Token purchase invoices,
  subscription charges, advertising-cash top-ups). A financial ledger, referenced by ID from Token
  and advertising records where relevant, but never embedding payment details in them, and never
  itself denominated in Token.

These three domains never merge. A Token record may *reference* a billing record ID; it never
contains payment details, and a billing record is never itself expressed as a Token quantity.

### Capability classification — a charging-treatment axis, independent of Edition access

AI Commerce OS capabilities are classified into four charging tiers: **free foundational**,
**quota-included**, **token-metered**, **advertising-cash-funded**. This classification describes
**charging treatment only**. It grants no UI, API, or Edition access on its own — **ADR-0002
remains the sole authority for Edition/API/UI permissions.** A capability being "free" here does
not grant it Operator visibility, and a Developer-only capability (per ADR-0002's Permission
Boundary) may simultaneously be "free" in charging terms while remaining completely unreachable
from Operator Edition. The two axes — "how is this charged" and "who may reach this" — are
orthogonal and must never be conflated.

With that caveat in force, a **provisional, explicitly not-yet-accepted** classification of
today's actual capabilities, for owner review:

| Capability | Charging tier (provisional) | Edition access (per ADR-0002, unchanged by this ADR) |
|---|---|---|
| Agent registry listing/inspection (`agents.py`) | free foundational (no LLM call) | Developer only |
| Task queue CRUD (`tasks.py`) | free foundational (no LLM call) | Developer only |
| AI CEO / Product / Sales Agent LLM-backed execution | token-metered (real `LLMUsage` already captured) | Developer only today; Operator-facing once graduated (ADR-0002A) |
| A to-be-defined small recurring allowance | quota-included | n/a — not yet designed |
| Ads Center (not built) | advertising-cash-funded | n/a — reserved, ADR-0004 |

### Policy-level treatment of required topics

- **Account ownership**: a Token account is owned by a Business Cell (the existing tenant
  boundary per DB-013), not by an individual user, device, or Edition.
- **Available balance / reserved balance**: both are *projections computed from the
  ledger*, never independently authoritative. See Accounting Invariants and the companion domain
  model.
- **Grants and purchased Token**: tracked as distinct Token lots by source (purchased,
  plan-included, promotional, compensation, manually granted) — never merged into one anonymous
  balance. See the domain model.
- **Expiration rules**: expiration is possible and must be tracked per lot. Exact durations are
  not decided by this ADR. Consumption order is provisionally earliest-expiring-first.
- **Consumption metering**: formalizes the `LLMUsage` data already captured today into a
  first-class, provider-call-level metered record (see domain model's `TokenMeteredUsageLine`).
- **Pre-authorization**: a task-level reservation/authorization envelope opened before execution,
  estimate-based.
- **Settlement**: task-level, aggregating one or more provider-call-level usage lines; may occur
  in phases for asynchronous multi-provider tasks. Recording a usage line
  (`Token.UsageLineRecorded`) is a distinct, earlier fact from settling it — settlement
  (`Token.Consumed`) is the only event that actually deducts Token, each usage line is settled at
  most once unless later reversed, and settled consumption is immutable. See domain model §3.1.
- **Release**: before settlement — an unused or unneeded reservation returns to available balance.
  Not a ledger reversal; simply closes an open reservation.
- **Refund/reversal**: after settlement — a correction is a new compensating ledger entry
  (`Token.ConsumptionReversed`), never an edit to the settled record. This is explicitly distinct
  from an RMB refund, which belongs entirely to the separate billing domain (see domain model).
- **Retry and idempotency**: a unified framework of per-operation-family business-unique
  references (task reservation, usage recording, settlement, release, reversal, purchase credit,
  grants, lot expiration, manual adjustment, pricing publication each with their own identity
  scope, all Business-Cell-scoped where applicable) — not a single reused `(source, request_id)`
  tuple, and not one oversized compound key covering every operation type. See domain model §5.
- **Task failure handling**: pre-settlement failure releases the reservation; post-settlement
  correction is a reversal; neither is ever silently absorbed as a loss with no record.
- **Manual adjustment**: requires reason, actor, timestamp, and an audit reference — never a bare
  balance edit.
- **Audit trail**: every ledger entry is itself part of the audit trail; manual adjustments
  additionally require an explicit audit reference.
- **Pricing-version snapshots**: immutable once referenced by any consumption record.
- **Model/provider cost mapping**: versioned data (a `PricingSnapshot`), not hardcoded, not
  decided by this ADR (no numbers are assigned here).
- **Operator visibility**: an Operator may read their own Business Cell's Token account and
  ledger; nothing more.
- **Operator Cloud authority**: cross-tenant grants, manual adjustments, and pricing-snapshot
  publication are Operator Cloud administrative actions (ADR-0005, not designed here).
- **Service degradation when balance is insufficient**: an attempted consumption or authorization
  that cannot be covered is explicitly **rejected** (`Token.ConsumptionRejected`) — never run on
  an implicit negative balance, and never silently degraded without a clear signal to the
  operator.
- **Reconciliation and gross-margin reporting**: compares ledger-derived metered consumption
  against the pricing snapshot and cost mapping active at settlement time; cached balances
  (account- and lot-level) are checked against the ledger, never trusted on their own.

### Accounting Invariants

These are non-negotiable rules the domain model must satisfy:

1. Token balance can never silently become negative.
2. `available + reserved` must always reconcile with ledger state — a cached balance that
   disagrees with the ledger is a bug, not a source of truth.
3. Settled consumption is immutable; corrections are new compensating ledger entries, never edits
   to a settled record.
4. Every manual adjustment requires reason, actor, timestamp, and an audit reference.
5. Every consumption record references the exact pricing snapshot used at settlement time.
6. Advertising cash can never automatically convert to or from Token, in either direction.
7. Token cannot be transferred between operators/tenants unless a future ADR explicitly allows
   it — no such ADR exists today.
8. Deleting a task must never delete its accounting history — ledger entries outlive the task row
   they originated from.

---

## Consequences

Positive:
- A Token account's state is always explainable and reconstructable from its ledger, which makes
  later implementation (and any audit, dispute, or reconciliation) tractable rather than a matter
  of trusting a mutable number.
- The strict separation from advertising cash and RMB billing prevents an entire class of future
  bugs and misunderstandings (accidental cross-conversion, embedding payment details in Token
  records, treating Token as withdrawable).
- The charging-tier/Edition-access separation prevents a natural but incorrect assumption (that
  "free" implies "visible to Operator") from leaking into later implementation.

Negative:
- No numbers exist yet — retail pricing, exchange ratio, and package design remain fully open,
  meaning the economic viability of the whole system is not yet assessable from this ADR alone.
- The reserve/settle/multi-provider-call model is more structurally complex than a naive counter,
  which is a real cost to eventually implement and test correctly.

---

## Rules Introduced

1. No code may implement Token consumption, expiration, release, reversal, or adjustment by
   directly editing a balance or lot field. Every such change must be expressed as a
   `TokenLedgerEntry`.
2. Token, advertising cash, and RMB billing records must never be merged into a single balance,
   table, or account concept.
3. Any future retail price, exchange ratio, package design, ad rebate, or payment-channel
   decision requires its own ADR (or an explicit amendment to this one) — none is established
   here.
4. Every new AI-Commerce-OS capability must be assigned a charging tier (free foundational /
   quota-included / token-metered / advertising-cash-funded) independently of, and without
   altering, its ADR-0002 Edition access.
5. The word "Token" in any future document must be disambiguated from platform OAuth tokens, JWT
   auth tokens, and the `task_result_sanitizer.py` secret-redaction key of the same name.

---

## Naming Collisions

The word "Token" (or "pricing") already refers to five unrelated things in this repository. Future
contributors must not conflate any of them with the AI Token Economy defined here:

1. **"Platform Tokens"** (`docs/01-reference-architecture/RA-006-security-architecture.md` §11
   Secret Management) — OAuth/API tokens for e-commerce platform connectors (Douyin, Taobao,
   etc.). A secret, not a usage unit.
2. **JWT Access Token / Refresh Token** (`docs/07-api/API-002-authentication-api.md`) — human/
   system authentication, unrelated to AI service usage.
3. **`_SENSITIVE_KEYS` `"token"`/`"access_token"`** (`backend/app/services/task_result_sanitizer.py`)
   — a secret-redaction category (auth tokens to mask from logs), not a usage metric.
4. **"Pricing Agent" / "Pricing suggestions"** (`docs/00-project/vision.md`,
   `docs/00-project/glossary.md`) — the *operator's product retail pricing* (helping price goods
   for sale on their shop), not AI-service pricing. Not yet implemented as running code.
5. **`LLM_MAX_TOKENS`** (`backend/app/core/config.py`) — a per-request generation cap passed to
   the LLM API call, not an account-level Token balance.

---

## Explicit Non-Goals

This ADR does **not** decide, and none of the following exist anywhere in the repository today
(confirmed by the investigation in Context, not assumed):

- Retail Token pricing (RMB per Token, or any equivalent).
- The RMB-to-Token exchange ratio.
- Token package prices or tiers.
- Advertising rebate percentages.
- Payment-channel selection or integration (no SDK for any payment provider exists in the repo).
- Exact Token expiry durations for any lot type.

Any of the above requires a future decision — a new ADR or an explicit amendment to this one —
before implementation.

---

## References

- ADR-0002 Edition Boundary (`docs/10-adr/ADR-0002-edition-boundary.md`) — the Operator Edition
  surface the future Token Center will live inside.
- ADR-0002A Experience Surface Preservation (`docs/10-adr/ADR-0002A-experience-surface-preservation.md`)
  — reserved the AI Account / Token Center surface this ADR defines accounting rules for.
- `docs/10-adr/ADR-0003-token-domain-model.md` — companion document, entities/lifecycle/invariants.
- `docs/10-adr/ADR-0003-token-event-catalog.md` — companion document, event catalog.
- `docs/05-database/DB-013-multi-tenant-strategy.md` — Business Cell as tenant/ownership boundary.
- `docs/01-reference-architecture/RA-003-event-architecture.md` — event naming/metadata convention reused.
- `backend/app/llm/models.py` (`LLMUsage`) — the existing usage-metering signal this ADR formalizes.
