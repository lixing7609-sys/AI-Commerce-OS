import { getArtifact, getArtifacts } from "./artifactApi";
import { getDeliverable } from "./deliverableApi";

const DEFAULT_LIMIT = 50;
const LEGACY_DELIVERABLE_REF = /(?:legacy-)?deliverable:\/\/(\d+)/i;

function parseJsonObject(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function legacyDeliverableIdOf(artifact = {}) {
  if (artifact.legacy_deliverable_id != null) return String(artifact.legacy_deliverable_id);
  if (artifact.deliverable_id != null) return String(artifact.deliverable_id);
  const metadata = parseJsonObject(artifact.description);
  if (metadata.legacy_deliverable_id != null) return String(metadata.legacy_deliverable_id);
  if (metadata.deliverable_id != null) return String(metadata.deliverable_id);
  const match = String(artifact.content_ref || "").match(LEGACY_DELIVERABLE_REF);
  return match ? match[1] : null;
}

function artifactPreview(artifact = {}) {
  const content = parseJsonObject(artifact.content_ref);
  const description = parseJsonObject(artifact.description);
  return {
    ...description,
    ...content,
    summary: description.summary || content.summary || artifact.description || artifact.title || "",
    location: artifact.location ?? null,
    content_ref: artifact.content_ref ?? null,
  };
}

export function normalizeArtifactAsset(artifact = {}, compatibility = {}) {
  const legacyDeliverableId = legacyDeliverableIdOf(artifact);
  const preview = artifactPreview(artifact);
  const artifactType = artifact.artifact_type || "general_result";
  const status = artifact.status || "active";
  const sourceTaskId = artifact.task_asset_id || artifact.task_id || null;
  const executionId = artifact.execution_id || preview.execution_id || preview.source_session_id || null;
  const version = artifact.version || 1;
  const legacyDetail = compatibility.legacy_detail || null;

  return {
    ...legacyDetail,
    ...artifact,
    id: artifact.id || artifact.artifact_id || "",
    artifact_id: artifact.id || artifact.artifact_id || "",
    name: artifact.title || artifact.name || "",
    title: artifact.title || artifact.name || "",
    artifact_type: artifactType,
    deliverable_type: artifactType,
    status,
    task_id: sourceTaskId,
    task_asset_id: sourceTaskId,
    source_task_id: sourceTaskId,
    execution_id: executionId,
    conversation_id: artifact.conversation_id || null,
    decision_id: artifact.decision_id || null,
    created_at: artifact.created_at || null,
    updated_at: artifact.updated_at || artifact.created_at || null,
    file_reference: artifact.location || artifact.content_ref || null,
    location: artifact.location || null,
    content_ref: artifact.content_ref || null,
    preview,
    result: preview,
    metadata: {
      canonical_source: "artifact_asset",
      compatibility_source: legacyDetail ? "legacy_deliverable" : null,
      provenance: preview,
    },
    provenance: preview,
    legacy_deliverable_id: legacyDeliverableId,
    legacy_workflow_available: Boolean(legacyDeliverableId),
    current_version: legacyDetail?.current_version || version,
    current_version_data: legacyDetail?.current_version_data || {
      version_number: version,
      format: "structured",
      content: preview.summary || "",
      structured_content: preview,
      created_at: artifact.created_at || null,
    },
    versions: legacyDetail?.versions || [],
    available_actions: legacyDetail?.available_actions || (legacyDeliverableId ? ["export"] : []),
    child_tasks: legacyDetail?.child_tasks || [],
    parent_task: legacyDetail?.parent_task || null,
    shop: legacyDetail?.shop || null,
    shop_id: legacyDetail?.shop_id ?? null,
    shop_name: legacyDetail?.shop_name || null,
    agent_name: legacyDetail?.agent_name || "ArtifactAsset",
    summary: legacyDetail?.summary || preview.summary || artifact.description || "",
  };
}

function filterArtifacts(items, { status, artifactType, keyword, limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const filtered = items.filter((item) => {
    const statusMatches = !status || item.status === status;
    const typeMatches = !artifactType || item.artifact_type === artifactType || item.deliverable_type === artifactType;
    const haystack = JSON.stringify(item).toLowerCase();
    const keywordMatches = !keyword || haystack.includes(keyword.toLowerCase());
    return statusMatches && typeMatches && keywordMatches;
  });
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    pagination: { limit, offset, returned: Math.min(limit, Math.max(filtered.length - offset, 0)) },
    source: "artifact_asset",
  };
}

export async function getArtifactList(options = {}) {
  const artifacts = await getArtifacts();
  const items = Array.isArray(artifacts) ? artifacts.map((item) => normalizeArtifactAsset(item)) : [];
  return filterArtifacts(items, options);
}

export async function getArtifactDetail(artifactId, { includeLegacy = true } = {}) {
  const artifact = await getArtifact(artifactId);
  const legacyId = legacyDeliverableIdOf(artifact);
  let legacyDetail = null;
  if (includeLegacy && legacyId) {
    legacyDetail = await getDeliverable(legacyId);
  }
  return normalizeArtifactAsset(artifact, { legacy_detail: legacyDetail });
}

export function getArtifactDisplayModel(artifact, compatibility) {
  return normalizeArtifactAsset(artifact, compatibility);
}

export const __artifactReadServiceInternals = {
  artifactPreview,
  filterArtifacts,
  legacyDeliverableIdOf,
  normalizeArtifactAsset,
};
