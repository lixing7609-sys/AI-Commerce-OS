import { describe, expect, it } from "vitest";
import { sinoStatus } from "./founderStatus.js";

describe("Founder status mapping", () => {
  it("never labels an error state as online", () => {
    expect(sinoStatus(true)).toEqual({ label: "在线", className: "is-online" });
    expect(sinoStatus(true, true)).toEqual({ label: "思考中", className: "is-thinking" });
    expect(sinoStatus(false)).toEqual({ label: "错误", className: "is-error" });
  });
});
