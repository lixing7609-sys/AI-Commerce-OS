import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import shellSource from "./SinoFounderShell.jsx?raw";

const workspaceCss = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Founder workspace visual language", () => {
  it("defines one readable typography, icon, spacing, radius, surface, hover, and divider token set", () => {
    for (const token of [
      "--workspace-font", "--workspace-text", "--workspace-text-secondary",
      "--workspace-text-muted", "--workspace-surface-main", "--workspace-surface-panel",
      "--workspace-hover", "--workspace-divider", "--workspace-radius-panel",
      "--workspace-radius-row", "--workspace-radius-composer", "--workspace-icon-size",
      "--workspace-icon-stroke", "--workspace-body-size", "--workspace-nav-size",
    ]) expect(workspaceCss).toContain(token);
    expect(workspaceCss).toContain("--workspace-body-size: 15px");
    expect(workspaceCss).toContain("--workspace-nav-size: 14.5px");
    expect(workspaceCss).toContain("--workspace-meta-size: 13px");
  });

  it("uses semantic SVG icons rather than legacy unicode glyphs for workspace top actions", () => {
    expect(shellSource).toContain("<ComposeIcon />");
    expect(shellSource).not.toContain("PanelWidthIcon");
    expect(shellSource).not.toContain(">＋<");
    expect(shellSource).not.toContain(">↔<");
  });

  it("applies readable typography to navigation, conversation, composer, and execution surfaces", () => {
    for (const selector of [
      ".founder-navigation-panel .sino-sidebar-primary-title",
      ".founder-conversation-surface .sino-conversation-log article",
      ".founder-conversation-surface .sino-global-composer textarea",
      ".founder-execution-center .sino-work-queue-heading h2",
      ".founder-execution-center .sino-task-status-empty small",
    ]) expect(workspaceCss).toContain(selector);
  });

  it("keeps both side panels rounded above the full-width top bar", () => {
    expect(workspaceCss).toContain("border-radius: var(--workspace-radius-panel)");
    expect(workspaceCss).toContain("--workspace-topbar-height: 60px");
    expect(workspaceCss).toContain(".founder-navigation-panel { grid-template-rows: auto minmax(0, 1fr) auto; height: auto; margin: var(--workspace-panel-inset) 0 var(--workspace-panel-inset) var(--workspace-panel-inset);");
    expect(workspaceCss).toContain(".founder-execution-center { width: auto; height: auto; margin: var(--workspace-panel-inset) var(--workspace-panel-inset) var(--workspace-panel-inset) 0;");
    expect(workspaceCss).toContain(".founder-workspace > .founder-workspace-topbar { grid-column: 1 / -1;");
  });

  it("spaces the search below the shared divider and reuses section typography for Execution Center", () => {
    expect(workspaceCss).toContain("margin: 8px 1px 6px");
    expect(workspaceCss).toContain(".founder-execution-center .sino-work-queue-heading h2 { font-family: var(--workspace-font); font-size: var(--workspace-nav-size); font-weight: 600; line-height: var(--workspace-nav-line); }");
  });

  it("aligns Recent Conversation titles directly with the Recent section heading", () => {
    expect(workspaceCss).toContain(".founder-navigation-panel .sino-conversation-item .sino-conversation-item__open { gap: 0; padding-left: 10px; }");
    expect(workspaceCss).not.toContain("padding-left: calc(9px + var(--workspace-nav-icon-box) + var(--workspace-nav-gap))");
  });

  it("gives the Project workspace a wide list and a shorter bottom-bound Composer", () => {
    expect(workspaceCss).toContain("width: min(calc(100% - 48px), 1120px)");
    expect(workspaceCss).toContain(".founder-conversation-surface > .sino-project-workspace > .sino-conversation-composer-dock { position: sticky; bottom: 0;");
    expect(workspaceCss).toContain(".founder-conversation-surface > .sino-project-workspace .sino-global-composer { min-height: 88px;");
    expect(workspaceCss).toContain(".sino-project-conversation-row { display: grid; grid-template-columns: minmax(0, 1fr) auto;");
    expect(workspaceCss).toContain(".sino-project-workspace > header { flex: 0 0 auto; padding-bottom: 6px; border-bottom: 0; }");
    expect(workspaceCss).toContain(".sino-model-selector__trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
  });
});
