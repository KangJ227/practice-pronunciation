import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createAttemptUploadWorkflow } from "@/lib/services";

export const runtime = "nodejs";

const schema = z.object({
  filename: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const input = schema.parse(await request.json());
    return jsonOk(await createAttemptUploadWorkflow({
      segmentId: params.id,
      filename: input.filename,
    }));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to prepare attempt upload.",
      400,
    );
  }
}
