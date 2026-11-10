import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, documents, users } from "../src/db/schema";
import {
  deleteDocument,
  downloadDocument,
  listDocuments,
  uploadDocument,
  type DocumentStorage,
} from "../src/server/document-service";
import { createTestDatabase, type TestDatabase } from "./helpers/db";

const OWNER = { id: 1, email: "owner@example.com", role: "owner" as const };
const ACCOUNTANT = { id: 2, email: "clerk@example.com", role: "accountant" as const };

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "latin1");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

interface Stub {
  storage: DocumentStorage;
  objects: Map<string, Uint8Array>;
}

function stubStorage(): Stub {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    storage: {
      put: async (key, body) => {
        objects.set(key, body);
      },
      get: async (key) => {
        const body = objects.get(key);
        if (!body) {
          throw new Error("missing");
        }
        return { body, contentType: "application/octet-stream", contentLength: body.byteLength };
      },
      delete: async (key) => {
        objects.delete(key);
      },
    },
  };
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.reset();
  await database.db.insert(users).values([
    {
      id: 1,
      email: OWNER.email,
      name: "Owner",
      role: "owner",
      passwordHash: "x",
    },
    {
      id: 2,
      email: ACCOUNTANT.email,
      name: "Clerk",
      role: "accountant",
      passwordHash: "x",
    },
  ]);
});

function upload(overrides: Partial<Parameters<typeof uploadDocument>[2]> = {}) {
  return {
    entityType: "sale" as const,
    entityId: 7,
    filename: "bill.pdf",
    kind: "sales_invoice",
    bytes: new Uint8Array(PDF),
    ...overrides,
  };
}

describe("document service", () => {
  it("stores a PDF under an entity key, sniffs its type and audits the upload", async () => {
    const stub = stubStorage();
    const row = await uploadDocument(database.db, OWNER, upload(), stub.storage);

    expect(row.mimeType).toBe("application/pdf");
    expect(row.sizeBytes).toBe(PDF.byteLength);
    expect(row.filename).toBe("bill.pdf");
    expect(row.objectKey).toMatch(/^sale\/7\/[0-9a-f-]+\.pdf$/);
    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(stub.objects.has(row.objectKey)).toBe(true);

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, "document"));
    expect(audits.some((entry) => entry.action === "upload")).toBe(true);
  });

  it("lists metadata only and filters by entity", async () => {
    const stub = stubStorage();
    await uploadDocument(database.db, OWNER, upload({ filename: "one.pdf" }), stub.storage);
    await uploadDocument(
      database.db,
      OWNER,
      upload({ filename: "photo.jpg", bytes: new Uint8Array(JPEG) }),
      stub.storage,
    );
    await uploadDocument(
      database.db,
      OWNER,
      upload({ entityType: "purchase", entityId: 9, filename: "bill.png", bytes: new Uint8Array(PNG) }),
      stub.storage,
    );

    const rows = await listDocuments(database.db, "sale", 7);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.filename).sort()).toEqual(["one.pdf", "photo.jpg"]);
    expect(rows[0]).not.toHaveProperty("body");
  });

  it("rejects a file over 10 MB and an unsupported magic-byte sniff", async () => {
    const stub = stubStorage();

    await expect(
      uploadDocument(
        database.db,
        OWNER,
        upload({ filename: "huge.pdf", bytes: new Uint8Array(10_000_001) }),
        stub.storage,
      ),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      uploadDocument(
        database.db,
        OWNER,
        upload({
          filename: "fake.pdf",
          bytes: new Uint8Array(Buffer.from("just some text", "latin1")),
        }),
        stub.storage,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("downloads the stored bytes", async () => {
    const stub = stubStorage();
    const row = await uploadDocument(database.db, OWNER, upload(), stub.storage);

    const file = await downloadDocument(database.db, row.id, stub.storage);

    expect(file.row.id).toBe(row.id);
    expect(Buffer.from(file.body).toString("latin1")).toBe(PDF.toString("latin1"));
    expect(file.row.mimeType).toBe("application/pdf");
  });

  it("deletes the row and the object for the owner and audits it", async () => {
    const stub = stubStorage();
    const row = await uploadDocument(database.db, OWNER, upload(), stub.storage);

    await deleteDocument(database.db, OWNER, row.id, stub.storage);

    const remaining = await database.db.select().from(documents);
    expect(remaining).toHaveLength(0);
    expect(stub.objects.has(row.objectKey)).toBe(false);

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, "document"));
    expect(audits.some((entry) => entry.action === "delete")).toBe(true);
  });

  it("refuses to delete when the caller is not the owner", async () => {
    const stub = stubStorage();
    const row = await uploadDocument(database.db, OWNER, upload(), stub.storage);

    await expect(
      deleteDocument(database.db, ACCOUNTANT, row.id, stub.storage),
    ).rejects.toMatchObject({ status: 403 });

    expect(stub.objects.has(row.objectKey)).toBe(true);
  });
});
