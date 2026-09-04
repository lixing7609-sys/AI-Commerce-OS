import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const kitDir = fileURLToPath(new URL(".", import.meta.url));
const jsxFiles = readdirSync(kitDir).filter((f) => f.endsWith(".jsx"));

function read(file) {
  return readFileSync(`${kitDir}${file}`, "utf-8");
}

const BANNED_ICON_IMPORTS = ["react-icons", "@heroicons", "@fortawesome", "react-feather"];

/**
 * Design DNA v1.0 review-checklist rules, automated where the rule is
 * mechanically checkable — docs/01-foundation/design/design-review-
 * checklist.md "Components" section: single icon source, no duplicate
 * local Button, no arbitrary legacy hex colors in new components.
 */
describe("console/kit conventions", () => {
  it("no file imports a second icon library alongside lucide-react", () => {
    for (const file of jsxFiles) {
      const src = read(file);
      for (const banned of BANNED_ICON_IMPORTS) {
        expect(src.includes(banned), `${file} imports banned icon source "${banned}"`).toBe(false);
      }
    }
  });

  it("Icon.jsx is the only file importing lucide-react directly", () => {
    const importers = jsxFiles.filter((f) => f !== "Icon.jsx" && read(f).includes('from "lucide-react"'));
    expect(importers, "components should render icons via Icon.jsx, not import lucide-react directly").toEqual([]);
  });

  it("only Icon.jsx exports an ICON_SIZES constant (single source of truth for sizes)", () => {
    const exporters = jsxFiles.filter((f) => f !== "Icon.jsx" && /export const ICON_SIZES/.test(read(f)));
    expect(exporters).toEqual([]);
  });

  const NEW_DESIGN_DNA_FILES = [
    "IconButton.jsx", "TextButton.jsx", "Input.jsx", "Textarea.jsx", "Select.jsx", "Checkbox.jsx",
    "Radio.jsx", "Switch.jsx", "SegmentedControl.jsx", "Badge.jsx", "SearchField.jsx", "FilterBar.jsx",
    "Tooltip.jsx", "Popover.jsx", "DropdownMenu.jsx", "Drawer.jsx", "Banner.jsx", "Divider.jsx",
    "Breadcrumb.jsx", "Pagination.jsx", "CommandPalette.jsx", "ErrorState.jsx", "NotConnectedState.jsx",
    "Skeleton.jsx", "KeyValueList.jsx", "Metric.jsx", "Timeline.jsx", "ActivityFeed.jsx",
    "AIRecommendation.jsx", "AIDecisionCard.jsx", "AIExplanation.jsx", "AIConfidence.jsx", "AIRiskAlert.jsx",
    "AIActionApproval.jsx", "AIExecutionStatus.jsx", "AILearningFeedback.jsx", "AIModelBadge.jsx",
    "AICostIndicator.jsx", "AIAuditTrail.jsx", "StoreContextSwitcher.jsx", "TokenBalance.jsx",
    "DeviceStatus.jsx", "VersionStatus.jsx", "LicenseStatus.jsx", "ApprovalQueue.jsx",
    "AutomationPolicy.jsx", "WorkflowStatus.jsx", "AssetVersion.jsx", "ContentPreview.jsx",
  ];

  it("every new Design DNA v1.0 component file exists", () => {
    for (const file of NEW_DESIGN_DNA_FILES) {
      expect(jsxFiles.includes(file), `expected ${file} to exist in console/kit`).toBe(true);
    }
  });

  it("new Design DNA components contain no raw arbitrary hex colors (tokens only)", () => {
    const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
    for (const file of NEW_DESIGN_DNA_FILES) {
      const src = read(file);
      const matches = src.match(hexPattern) ?? [];
      expect(matches, `${file} has raw hex color(s) ${matches.join(", ")} — use a var(--token) instead`).toEqual([]);
    }
  });
});
