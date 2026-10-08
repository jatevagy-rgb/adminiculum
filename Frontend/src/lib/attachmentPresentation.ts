// Attachment metadata presentation (metadata-only v1: file bytes are not stored,
// so this module never implies contents are available).

export interface AttachmentMetaLike {
  fileName?: string | null;
  fileType?: string | null;
  sizeBytes?: number | null;
}

const GENERIC_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

/** Safe display name; missing/blank file names fall back to a generic label. */
export function attachmentDisplayName(attachment: AttachmentMetaLike): string {
  const name = (attachment.fileName || "").trim();
  return name || "Melléklet";
}

/** Human-readable size, or null when the stored size is absent/invalid. Never fabricated. */
export function formatAttachmentSize(sizeBytes?: number | null): string | null {
  if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes < 1024) return `${Math.round(sizeBytes)} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Concrete content type only; empty or generic binary types stay hidden (non-noisy). */
export function attachmentContentType(attachment: AttachmentMetaLike): string | null {
  const type = (attachment.fileType || "").trim();
  if (!type) return null;
  if (GENERIC_CONTENT_TYPES.has(type.toLowerCase())) return null;
  return type;
}
