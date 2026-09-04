import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITIONS, getActiveEdition } from "./editionConfig";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getActiveEdition", () => {
  it("defaults to Founder when nothing is configured (Founder is the primary product; bare URL opens it)", () => {
    expect(getActiveEdition("")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });

  it("falls back to the existing ?mode=operator-preview URL override", () => {
    expect(getActiveEdition("?mode=operator-preview")).toBe(EDITIONS.OPERATOR);
  });

  it("resolves ?mode=founder to Founder Edition", () => {
    expect(getActiveEdition("?mode=founder")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });

  it("resolves ?mode=studio to Studio Edition", () => {
    expect(getActiveEdition("?mode=studio")).toBe(EDITIONS.STUDIO);
  });

  it("preserves explicit access to the legacy Developer/Task Center workspace via ?mode=developer", () => {
    expect(getActiveEdition("?mode=developer")).toBe(EDITIONS.DEVELOPER);
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

  it("safely falls back to the Founder default for an unknown VITE_EDITION value", () => {
    vi.stubEnv("VITE_EDITION", "not-a-real-edition");
    expect(getActiveEdition("")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });

  it("safely falls back to the Founder default for an unknown ?mode= value", () => {
    expect(getActiveEdition("?mode=not-a-real-mode")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });
});

describe("getActiveEdition — path aliases (四端产品体系 V1)", () => {
  it("resolves /cloud to Operator Cloud", () => {
    expect(getActiveEdition("", "/cloud")).toBe(EDITIONS.OPERATOR_CLOUD);
  });

  it("resolves /founder to Founder Edition", () => {
    expect(getActiveEdition("", "/founder")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });

  it("resolves /operator to Operator Edition", () => {
    expect(getActiveEdition("", "/operator")).toBe(EDITIONS.OPERATOR);
  });

  it("resolves /studio to Studio Edition", () => {
    expect(getActiveEdition("", "/studio")).toBe(EDITIONS.STUDIO);
  });

  it("is tolerant of a trailing slash and case", () => {
    expect(getActiveEdition("", "/Studio/")).toBe(EDITIONS.STUDIO);
  });

  it("path alias takes precedence over a conflicting ?mode= query", () => {
    expect(getActiveEdition("?mode=founder", "/studio")).toBe(EDITIONS.STUDIO);
  });

  it("falls back to query-param/default resolution for an unknown path", () => {
    expect(getActiveEdition("", "/not-a-real-path")).toBe(EDITIONS.FOUNDER_OPERATOR);
    expect(getActiveEdition("?mode=founder", "/not-a-real-path")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });

  it("bare root path still resolves via query/default, not a path alias", () => {
    expect(getActiveEdition("?mode=studio", "/")).toBe(EDITIONS.STUDIO);
    expect(getActiveEdition("", "/")).toBe(EDITIONS.FOUNDER_OPERATOR);
  });
});
