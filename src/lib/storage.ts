/**
 * Neon Object Storage (S3 compatible). Uploads are streamed through the app so the
 * bucket stays private; no public URL is ever stored. Credentials are read at call
 * time so a rotated key takes effect on the next request.
 */
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  contentLength: number;
}

interface CachedClient {
  fingerprint: string;
  client: S3Client;
}

let cached: CachedClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function storageClient(): S3Client {
  const endpoint = required("AWS_ENDPOINT_URL_S3");
  const region = process.env.AWS_REGION ?? "ap-southeast-1";
  const accessKeyId = required("AWS_ACCESS_KEY_ID");
  const secretAccessKey = required("AWS_SECRET_ACCESS_KEY");
  const fingerprint = `${endpoint}|${region}|${accessKeyId}`;

  if (!cached || cached.fingerprint !== fingerprint) {
    cached = {
      fingerprint,
      client: new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      }),
    };
  }
  return cached.client;
}

function bucketName(): string {
  return process.env.S3_BUCKET ?? "gst-documents";
}

/** `{entity_type}/{entity_id}/{uuid}.{ext}` — the only key shape the app creates. */
export function objectKey(
  entityType: string,
  entityId: number,
  extension: string,
): string {
  const safeType = entityType.replace(/[^a-z_]/gi, "");
  if (!safeType) {
    throw new Error("Object key needs an entity type");
  }
  if (!Number.isInteger(entityId) || entityId <= 0) {
    throw new Error("Object key needs a positive entity id");
  }
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!safeExtension) {
    throw new Error("Object key needs an extension");
  }
  return `${safeType}/${entityId}/${randomUUID()}.${safeExtension}`;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await storageClient().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<StoredObject> {
  const response = await storageClient().send(
    new GetObjectCommand({ Bucket: bucketName(), Key: key }),
  );
  if (!response.Body) {
    throw new Error(`Object ${key} has no body`);
  }
  const stream = response.Body as { transformToByteArray(): Promise<Uint8Array> };
  const body = await stream.transformToByteArray();
  return {
    body,
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength ?? body.byteLength,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await storageClient().send(
    new DeleteObjectCommand({ Bucket: bucketName(), Key: key }),
  );
}
