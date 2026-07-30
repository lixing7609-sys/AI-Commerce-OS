// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as shared from "./sharedDemoEntities.js";
import * as founder from "./founderDemoData.js";
import * as capability from "./capabilityDemoData.js";
import * as operator from "./operatorDemoData.js";
import * as studio from "./studioDemoData.js";
import * as cloud from "./cloudDemoData.js";

describe("demoData shared entity layer", () => {
  it("every getter resolves to a real record, not undefined", () => {
    expect(shared.getFeaturedProduct()).toBeTruthy();
    expect(shared.getFeaturedOrder()).toBeTruthy();
    expect(shared.getFeaturedCustomer()).toBeTruthy();
    expect(shared.getFeaturedContentProject()).toBeTruthy();
    expect(shared.getFeaturedDevice()).toBeTruthy();
    expect(shared.getFeaturedOperatorFleetEntry()).toBeTruthy();
  });

  it("featured order and featured customer are cross-consistent", () => {
    const order = shared.getFeaturedOrder();
    const customer = shared.getFeaturedCustomer();
    expect(customer.storeId).toBe(order.storeId);
  });

  it("featured device belongs to the featured operator fleet entry", () => {
    const device = shared.getFeaturedDevice();
    const operatorEntry = shared.getFeaturedOperatorFleetEntry();
    expect(device.operatorId).toBe(operatorEntry.id);
  });

  it("calling getFeaturedOrder twice returns the same order number (session-stable)", () => {
    expect(shared.getFeaturedOrder().orderNumber).toBe(shared.getFeaturedOrder().orderNumber);
  });

  it("per-group re-export modules load without error and expose the expected surface", () => {
    expect(typeof founder.getDecisions).toBe("function");
    expect(typeof founder.getFeaturedOrder).toBe("function");
    expect(capability.CAPABILITY_LIFECYCLE_STAGES).toHaveLength(8);
    expect(capability.CAPABILITY_SCOPE_OPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(operator.OPERATOR_FACING_PLATFORMS.length).toBeGreaterThan(0);
    expect(typeof studio.getFeaturedContentProject).toBe("function");
    expect(typeof cloud.getCloudState).toBe("function");
    expect(cloud.SHARED_DEMO_DEVICE_ID).toBe(shared.SHARED_DEMO_DEVICE_ID);
  });
});
