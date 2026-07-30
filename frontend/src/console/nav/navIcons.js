/**
 * Canonical Lucide icon names for the Founder sidebar's top-level
 * destinations and Zone D system utilities — Design DNA v1.1
 * (docs/01-foundation/design/navigation-shell-spec.md §Icons).
 *
 * Deliberate scope: only top-level Core/Labs/Cloud entries and
 * utility rows get icons. Nested sub-items (Core's secondary rows,
 * Labs/Cloud's expanded sub-navigation from the Operator v2/Studio/
 * Cloud registries) render as plain indented text with no icon — a
 * restrained, common pattern (Linear/Notion-style) that avoids the
 * unbounded effort of hand-picking icons for 40+ nested items across
 * three external registries this task does not own, while still
 * fully satisfying "no Unicode glyph icons in the Founder sidebar"
 * (there simply are none at that level).
 */
export const NAV_ICON_MAP = {
  founderWorkbench: "Gauge",
  agentCenter: "Bot",
  agentStudio: "Bot",
  promptCenter: "MessageSquareText",
  skillCenter: "Puzzle",
  workflowCenter: "Workflow",
  automationPolicy: "Workflow",
  knowledgeCenter: "BookOpen",
  connectorCenter: "Plug",
  capabilityCenter: "Layers",
  benchmarkCenter: "Layers",
  operatorLab: "FlaskConical",
  studioLab: "Palette",
  cloudCenter: "Cloud",
  cloudToken: "Coins",
  marketplaceCenter: "Store",
  cloudVersion: "GitBranch",
  cloudAssets: "Archive",
  monitoring: "Activity",
  logs: "ScrollText",
};

export const UTILITY_ICONS = {
  search: "Search",
  commandPalette: "Command",
  notifications: "Bell",
  settings: "Settings",
  productReview: "ClipboardCheck",
  account: "CircleUserRound",
  connectionStatus: "Wifi",
  collapse: "PanelLeftClose",
  expand: "PanelLeftOpen",
  chevronExpanded: "ChevronDown",
  chevronCollapsed: "ChevronRight",
};
