import { describe, expect, it } from "vitest";
import { hasConfiguredCredentials, toPlatformAuthorization } from "./credentialStore.js";

function shopFixture(overrides = {}) {
  return {
    id: 101,
    platform: "douyin",
    shop_name: "星辰家居抖音旗舰店",
    auth_type: "oauth",
    connection_status: "disconnected",
    last_connection_test_status: null,
    last_connection_test_at: null,
    token_expires_at: null,
    credentials: [],
    ...overrides,
  };
}

describe("toPlatformAuthorization", () => {
  it("reports not_configured when no credentials exist", () => {
    const auth = toPlatformAuthorization(shopFixture());
    expect(auth.credentialStatus).toBe("not_configured");
    expect(hasConfiguredCredentials(auth)).toBe(false);
    expect(auth.missingRequirements.length).toBeGreaterThan(0);
  });

  it("never includes a raw secret field, only credential_type/configured summaries", () => {
    const auth = toPlatformAuthorization(
      shopFixture({
        credentials: [{ credential_type: "access_token", configured: true, value_mask: "acce***oken" }],
        connection_status: "connected",
      })
    );
    expect(JSON.stringify(auth)).not.toMatch(/acce\*\*\*oken/);
    expect(auth).not.toHaveProperty("access_token");
    expect(auth).not.toHaveProperty("value_mask");
  });

  it("reports configured + authorizedScopes when the required oauth credential is present", () => {
    const auth = toPlatformAuthorization(
      shopFixture({
        credentials: [{ credential_type: "access_token", configured: true }],
        connection_status: "connected",
      })
    );
    expect(auth.credentialStatus).toBe("configured");
    expect(auth.authorizedScopes).toContain("access_token");
    expect(hasConfiguredCredentials(auth)).toBe(true);
  });

  it("reports invalid when connection_status is error even if credentials are configured", () => {
    const auth = toPlatformAuthorization(
      shopFixture({
        credentials: [{ credential_type: "access_token", configured: true }],
        connection_status: "error",
      })
    );
    expect(auth.credentialStatus).toBe("invalid");
  });

  it("reports expired when token_expires_at is in the past", () => {
    const auth = toPlatformAuthorization(
      shopFixture({
        credentials: [{ credential_type: "access_token", configured: true }],
        connection_status: "connected",
        token_expires_at: "2020-01-01T00:00:00Z",
      })
    );
    expect(auth.credentialStatus).toBe("expired");
  });

  it("missingRequirements points to OAuth authorization for oauth-type shops", () => {
    const auth = toPlatformAuthorization(shopFixture({ auth_type: "oauth" }));
    expect(auth.missingRequirements.join("")).toMatch(/OAuth/);
  });

  it("missingRequirements lists specific fields for manual-auth shops", () => {
    const auth = toPlatformAuthorization(shopFixture({ auth_type: "manual" }));
    expect(auth.missingRequirements).toEqual(
      expect.arrayContaining([expect.stringContaining("app_key"), expect.stringContaining("app_secret")])
    );
  });
});
