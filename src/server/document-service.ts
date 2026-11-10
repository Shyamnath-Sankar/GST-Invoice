/**
 * Bill attachments. Bytes live in Neon Object Storage; Postgres keeps only the
 * metadata row. The bucket is private and every read or write goes through the
 * app, so the storage client is injectable and easy to stub in tests.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documents, type DocumentEntity } from "@/db/schema";
import {
  deleteObject,
  getObject,
  objectKey,
  putObject,
  type StoredObject,
} from "@/lib/storage";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { ApiError } from "./errors";

export interface DocumentStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

export type DocumentRow = typeof documents.$inferSelect;

export interface DocumentActor extends Actor {
  role: "owner" | "accountant";
}

export interface UploadInput {
  entityType: DocumentEntity;
  entityId: number;
  filename: string;
  kind?: string;
  bytes: Uint8Array;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_ENTITIES: readonly DocumentEntity[] = [
  "sale",
  "purchase",
  "return",
  "party",
];

const defaultStorage: DocumentStorage = {
  put: (key, body, contentType) => putObject(key, body, contentType),
  get: (key) => getObject(key),
  delete: (key) => deleteObject(key),
};

interface Sniffed {
  mimeType: string;
  extension: "pdf" | "jpg" | "png";
}

/** Identify a supported upload from its first bytes, never from its name. */
export function sniffDocument(bytes: Uint8Array): Sniffed | null {
  const startsWith = (signature: readonly number[]): boolean =>
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte);

  // %PDF-
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  // JPEG SOI plus the first marker byte.
  if (startsWith([0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  // PNG signature.
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", extension: "png" };
  }
  return null;
}

function safeFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "";
  const trimmed = base.trim().slice(0, 200);
  return trimmed || "attachment";
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function listDocuments(
  db: Db,
  entityType: DocumentEntity,
  entityId: number,
): Promise<DocumentRow[]> {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.entityType, entityType), eq(documents.entityId, entityId)))
    .orderBy(desc(documents.createdAt), desc(documents.id));
}

export async function getDocument(db: Db, id: number): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return row ?? null;
}

async function requireDocument(db: Db, id: number): Promise<DocumentRow> {
  const row = await getDocument(db, id);
  if (!row) {
    throw new ApiError(404, "Attachment not found");
  }
  return row;
}

export async function uploadDocument(
  db: Db,
  actor: DocumentActor,
  input: UploadInput,
  storage: DocumentStorage = defaultStorage,
): Promise<DocumentRow> {
  if (!DOCUMENT_ENTITIES.includes(input.entityType)) {
    throw new ApiError(422, "Unknown attachment target");
  }
  if (!Number.isInteger(input.entityId) || input.entityId <= 0) {
    throw new ApiError(422, "Attach the file to a saved record");
  }
  if (input.bytes.byteLength === 0) {
    throw new ApiError(422, "The file is empty");
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(422, "Files must be 10 MB or smaller");
  }
  const sniffed = sniffDocument(input.bytes);
  if (!sniffed) {
    throw new ApiError(422, "Upload a PDF, JPEG or PNG file");
  }

  const key = objectKey(input.entityType, input.entityId, sniffed.extension);
  await storage.put(key, input.bytes, sniffed.mimeType);

  try {
    const [row] = await db
      .insert(documents)
      .values({
        entityType: input.entityType,
        entityId: input.entityId,
        kind: input.kind ?? "other",
        filename: safeFilename(input.filename),
        mimeType: sniffed.mimeType,
        sizeBytes: input.bytes.byteLength,
        objectKey: key,
        checksum: checksum(input.bytes),
        uploadedBy: actor.id,
      })
      .returning();
    if (!row) {
      throw new ApiError(500, "Could not save the attachment");
    }

    await audit(db, {
      userId: actor.id,
      userEmail: actor.email,
      action: "upload",
      entityType: "document",
      entityId: row.id,
      summary: `Uploaded ${row.filename} (${row.kind})`,
      after: row,
    });
    return row;
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function downloadDocument(
  db: Db,
  id: number,
  storage: DocumentStorage = defaultStorage,
): Promise<{ row: DocumentRow; body: Uint8Array; contentType: string }> {
  const row = await requireDocument(db, id);
  let file: StoredObject;
  try {
    file = await storage.get(row.objectKey);
  } catch {
    throw new ApiError(404, "The stored file is unavailable");
  }
  return { row, body: file.body, contentType: file.contentType };
}

export async function deleteDocument(
  db: Db,
  actor: DocumentActor,
  id: number,
  storage: DocumentStorage = defaultStorage,
): Promise<void> {
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the owner can delete an attachment");
  }
  const row = await requireDocument(db, id);

  // Removing the object first keeps Postgres from pointing at nothing. A
  // missing object is acceptable; the metadata row still goes away.
  await storage.delete(row.objectKey).catch(() => undefined);
  await db.delete(documents).where(eq(documents.id, id));

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "delete",
    entityType: "document",
    entityId: id,
    summary: `Deleted attachment ${row.filename}`,
    before: row,
  });
}
