// Intentional boundary copy: server/db/schema DocumentStatus is server-only.
// This union is kept in sync manually; the constraint lives in F1-S04 notes.
export const DOCUMENT_STATUSES = ["pending", "processing", "ready", "failed"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
