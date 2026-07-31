// Workspace file metadata for SinoFUT's full-screen entry — V2-002 §3.4.
// Demo-only: records file name/size/type locally so Founder can "upload to SinoFUT"
// rather than to a specific module. No file bytes are transmitted or stored anywhere —
// there is no real storage backend yet (see docs/2608-v2/08-backend-reuse-audit.md).

function storageKey(personaId) {
  return `sinofut-workspace-files:${personaId}`;
}

function loadAll(personaId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(personaId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(personaId, files) {
  window.localStorage.setItem(storageKey(personaId), JSON.stringify(files));
}

const EXTENSION_CATEGORY = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  md: "Markdown",
  markdown: "Markdown",
  mp4: "视频",
  mov: "视频",
  mp3: "音频",
  wav: "音频",
  zip: "ZIP",
  png: "图片",
  jpg: "图片",
  jpeg: "图片",
  gif: "图片",
};

export function categoryForFileName(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return EXTENSION_CATEGORY[ext] || "文件";
}

export function listFiles(personaId) {
  return loadAll(personaId).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

export function addFile(personaId, file) {
  const files = loadAll(personaId);
  const record = {
    id: `file-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: file.name,
    size: file.size,
    category: categoryForFileName(file.name),
    tags: [],
    uploadedAt: new Date().toISOString(),
  };
  files.push(record);
  saveAll(personaId, files);
  return record;
}

export function removeFile(personaId, id) {
  saveAll(personaId, loadAll(personaId).filter((f) => f.id !== id));
}

export function searchFiles(personaId, query) {
  const q = query.trim().toLowerCase();
  const files = listFiles(personaId);
  if (!q) return files;
  return files.filter(
    (f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );
}

export function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
