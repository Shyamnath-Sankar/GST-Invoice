/**
 * Manual check for Neon Object Storage: writes a small object, reads it back and
 * deletes it. Run after setting the AWS_* variables in .env.local.
 *
 *   npx tsx scripts/check-storage.ts
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { deleteObject, getObject, objectKey, putObject } = await import("../src/lib/storage");

const key = objectKey("return", 1, "txt");
const payload = new TextEncoder().encode(
  `gst-invoice storage check ${new Date().toISOString()}`,
);

try {
  await putObject(key, payload, "text/plain");
  const stored = await getObject(key);
  const text = new TextDecoder().decode(stored.body);
  if (text !== new TextDecoder().decode(payload)) {
    throw new Error("The bytes read back do not match the bytes written");
  }
  console.log(`Wrote and read ${stored.contentLength} bytes at ${key}`);
} finally {
  await deleteObject(key);
  console.log("Deleted the test object");
}
