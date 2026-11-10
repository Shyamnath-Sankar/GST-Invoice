import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  DOCUMENT_ENTITIES,
  listDocuments,
  uploadDocument,
} from "@/server/document-service";
import { intParam } from "@/server/doc-schema";
import type { DocumentEntity } from "@/db/schema";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, requireCsrf } from "@/server/http";
import { ApiError } from "@/server/errors";

export const runtime = "nodejs";

function entityParam(value: string | null): DocumentEntity {
  if (!value || !DOCUMENT_ENTITIES.includes(value as DocumentEntity)) {
    throw new ApiError(422, "Attach the file to a sale, purchase, return or party");
  }
  return value as DocumentEntity;
}

export async function GET(request: Request) {
  try {
    await currentSession();
    const params = new URL(request.url).searchParams;
    const entityType = entityParam(params.get("entity_type"));
    const entityId = intParam(params.get("entity_id"), 0);
    if (entityId <= 0) {
      throw new ApiError(422, "Attach the file to a saved record");
    }
    return noStore(NextResponse.json(await listDocuments(db, entityType, entityId)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Send the file as multipart/form-data");
    }

    const entityType = entityParam(String(form.get("entity_type") ?? ""));
    const entityId = intParam(String(form.get("entity_id") ?? ""), 0);
    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw new ApiError(422, "Choose a file");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const created = await uploadDocument(
      db,
      { ...actorOf(session), role: session.user.role },
      {
        entityType,
        entityId,
        filename: file.name || "attachment",
        kind: String(form.get("kind") ?? "other").slice(0, 40),
        bytes,
      },
    );
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
