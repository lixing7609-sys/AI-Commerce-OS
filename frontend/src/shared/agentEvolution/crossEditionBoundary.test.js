import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTENT_AGENT_ID,
  approveExperiment,
  evaluateCandidate,
  getLearningCandidates,
  getStableVersion,
  promoteCandidate,
} from "./evolutionMock.js";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../editionPolicy.js";

/**
 * 验证"Founder 的 Agent 演化引擎"与"Operator 看到的受限视图"其实是
 * 同一份共享状态（同一个 localStorage 仓库），不是两套各自维护的
 * mock——Operator 页面里"待我确认的改进"能不能操作，取决于 Founder
 * 是否已经评测过、候选风险等级，以及 shared/editionPolicy.js 里
 * Operator 档位的权限，而不是 Operator 自己伪造的另一份状态。
 */

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  };
}

function operatorCanApprove(candidate) {
  return (
    candidate.status === "evaluating" &&
    candidate.riskLevel === "low" &&
    hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_LOW_RISK)
  );
}

describe("cross-edition Agent Evolution boundary", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Operator cannot act on a candidate until Founder has evaluated it", () => {
    const candidate = getLearningCandidates(CONTENT_AGENT_ID)[0];
    expect(candidate.status).toBe("candidate");
    expect(operatorCanApprove(candidate)).toBe(false);
  });

  it("Operator can approve a low-risk candidate once Founder evaluates it, but approving alone does not change the stable version", () => {
    const candidateId = getLearningCandidates(CONTENT_AGENT_ID)[0].id;
    const beforeStable = getStableVersion(CONTENT_AGENT_ID);

    evaluateCandidate(candidateId);
    const evaluated = getLearningCandidates(CONTENT_AGENT_ID).find((c) => c.id === candidateId);
    expect(operatorCanApprove(evaluated)).toBe(true);

    const approval = approveExperiment(candidateId);
    expect(approval.ok).toBe(true);

    // Operator 的批准只是把候选推进到"实验中"，稳定版本仍然只能由
    // Founder 通过 promoteCandidate 显式晋升——不会被 Operator 的
    // 批准动作静默改变。
    expect(getStableVersion(CONTENT_AGENT_ID).id).toBe(beforeStable.id);

    const promotion = promoteCandidate(candidateId);
    expect(promotion.ok).toBe(true);
    expect(getStableVersion(CONTENT_AGENT_ID).id).not.toBe(beforeStable.id);
  });

  it("Operator policy never grants the platform-management or full-evolution keys Cloud/Founder rely on", () => {
    [
      POLICY_KEYS.EVOLUTION_FULL_CONTROL,
      POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_ANY_RISK,
      POLICY_KEYS.DEVICE_PLATFORM_MANAGE,
      POLICY_KEYS.TENANT_PLATFORM_MANAGE,
      POLICY_KEYS.OTA_RELEASE_MANAGE,
      POLICY_KEYS.DIAGNOSTICS_FULL,
    ].forEach((key) => {
      expect(hasPolicy(EDITIONS.OPERATOR, key)).toBe(false);
    });
  });
});
