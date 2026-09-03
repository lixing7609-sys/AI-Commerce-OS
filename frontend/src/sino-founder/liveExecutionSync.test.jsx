import { describe, expect, it } from "vitest";
import { shouldPollMission, shouldPollWorkspace } from "./ConversationWorkspace.jsx";

describe("live execution workspace sync", () => {
  it.each(["executing", "verification", "self_healing", "waiting_for_founder_authorization", "cancelling"])("polls %s without browser refresh", (status) => expect(shouldPollWorkspace(status)).toBe(true));
  it.each(["completed", "cancelled", "rejected", "technical_blocker"])("stops polling for terminal %s", (status) => expect(shouldPollWorkspace(status)).toBe(false));
  it.each(["WAITING_CHANGE_APPROVAL", "CHANGING", "VERIFYING", "queued", "running"])("polls active mission state %s without manual reload", (status) => expect(shouldPollMission(status)).toBe(true));
  it.each(["COMPLETED", "FAILED", "BLOCKED"])("stops mission polling for terminal %s", (status) => expect(shouldPollMission(status)).toBe(false));
});
