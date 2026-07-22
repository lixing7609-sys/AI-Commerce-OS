import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITIONS, getActiveEdition } from "./editionConfig";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getActiveEdition", () => {
  it("defaults to developer when nothing is configured (legacy behavior unchanged)", () => {
    expect(getActiveEdition("")).toBe(EDITIONS.DEVELOPER);
  });

  it("falls back to the existing ?mode=operator-preview URL override", () => {
    expect(getActiveEdition("?mode=operator-preview")).toBe(EDITIONS.OPERATOR);
  });

  it("prefers VITE_EDITION over the URL override when both are present", () => {
    vi.stubEnv("VITE_EDITION", "device-admin");

    expect(getActiveEdition("?mode=operator-preview")).toBe(
      EDITIONS.DEVICE_ADMIN
    );
  });

  it("reads each valid VITE_EDITION value", () => {
    for (const edition of Object.values(EDITIONS)) {
      vi.stubEnv("VITE_EDITION", edition);
      expect(getActiveEdition("")).toBe(edition);
    }
  });

  it("is case/whitespace tolerant for VITE_EDITION", () => {
    vi.stubEnv("VITE_EDITION", "  Operator  ");
    expect(getActiveEdition("")).toBe(EDITIONS.OPERATOR);
  });

  it("safely falls back to developer for an unknown VITE_EDITION value", () => {
    vi.stubEnv("VITE_EDITION", "not-a-real-edition");
    expect(getActiveEdition("")).toBe(EDITIONS.DEVELOPER);
  });
});
