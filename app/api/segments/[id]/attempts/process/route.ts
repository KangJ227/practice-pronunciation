import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { processAttemptUploadWorkflow } from "@/lib/services";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  storageKey: z.string().trim().min(1),
  filename: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const input = schema.parse(await request.json());
    return jsonOk(await processAttemptUploadWorkflow({
      segmentId: params.id,
      storageKey: input.storageKey,
      filename: input.filename,
    }));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to score uploaded attempt.",
      400,
    );
  }
}
