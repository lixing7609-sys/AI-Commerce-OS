# AI Interaction Language — AI Commerce OS Design DNA v1.0

This is the strongest source of AI Commerce OS's originality (Design DNA §5/§8): a consistent behavioral sequence, not a color palette. Every AI-originated action — a pricing suggestion, a content flag, an automation trigger — passes through the same six stages, each with one consistent component.

## The loop

```
Observe → Recommend → Explain → Approve → Execute → Learn
```

| Stage | What happens | Component | Required fields |
|---|---|---|---|
| **Observe** | AI identifies an event, anomaly, or opportunity from monitored data | `AIRecommendation` (header/trigger) | trigger description, source, timestamp |
| **Recommend** | AI proposes a specific business action | `AIRecommendation` (body) | proposed action, priority (P0/P1/P2), affected store/scope |
| **Explain** | AI presents reasoning, expected effect, cost, and risk | `AIExplanation` + `AIConfidence` + `AICostIndicator` + `AIRiskAlert` (as applicable) | reason, expected effect, confidence %, cost estimate, risk level |
| **Approve** | Founder approves, rejects, or edits the proposed action | `AIActionApproval` | approve/reject/edit actions, approver identity, decision timestamp |
| **Execute** | System shows deterministic progress and an audit trail | `AIExecutionStatus` + `AIAuditTrail` | current step, progress state, start/end time, linked audit entries |
| **Learn** | System records the result and any model/policy improvement | `AILearningFeedback` | outcome, delta vs. prediction, feedback recorded |

`AIModelBadge` (which model/policy produced this) may appear at any stage where provenance matters; `AICostIndicator` may appear at Explain and again at Learn (predicted vs. actual).

## Design rules for the loop

1. **A recommendation is never presented without a reason.** `AIRecommendation` must not render without at least a one-line `reason` — an AI suggestion with no explanation is not shippable per Design DNA Principle 6.
2. **Approval is a decision, not a link-out.** The current Secretary module's "需要我审批" section is a list of rows that navigate elsewhere to approve — this pass replaces that with `AIActionApproval` rendering inline approve/reject/edit controls directly where the recommendation appears (see Founder pilot notes in the implementation report).
3. **Execution state is always visible, never implied.** Once approved, the action's `AIExecutionStatus` must be reachable from the same card that showed the recommendation — no silent "it's running somewhere."
4. **Cost and risk are visible wherever they're non-trivial.** `AICostIndicator`/`AIRiskAlert` are not optional decoration; omit them only when an action is genuinely free and riskless (e.g. a read-only insight).
5. **Confidence is quantified, not vibes.** `AIConfidence` renders a numeric/percentage value plus a short qualitative label ("High confidence — 92%"), never a bare adjective alone.
6. **Learning is auditable.** `AILearningFeedback` records into `AIAuditTrail`; "the system learned something" must be inspectable after the fact, not just claimed.

## Where this shows up per surface (this pass vs. future)

- **Founder工作台 (this pass):** the Decision Home pilot replaces the flat "AI 建议"/"AI 正在做什么" list sections with the full loop — see `component-spec.md` and the implementation report for the concrete before/after.
- **Operator Lab, Studio Lab, Cloud Center (deferred):** these surfaces already have their own automation/approval concepts (`AutomationPolicy`, `WorkflowStatus`) built on separate token systems (`App.css`/`studioConsole.css`/`cloudConsole.css`). Applying this loop there is the recommended next migration batch — not attempted in this pass, since it would mean touching pages explicitly out of scope (see Design DNA §22 non-goals).

## Anti-patterns (explicitly rejected)

- A chat box as the *only* AI surface (Design DNA Principle 6) — chat remains available (Secretary's existing chat panel is preserved) but is not where decisions get made.
- Recommendation cards with no visible cost/risk when the action has real cost/risk.
- "Approve" buttons that just navigate to another page instead of completing the action inline.
- Mixing AI-accent color onto non-AI UI — dilutes the signal (see `color-spec.md` rules).
