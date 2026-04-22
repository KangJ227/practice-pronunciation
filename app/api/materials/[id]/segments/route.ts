import { z } from "zod";
import { updateMaterialSegmentsWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

const segmentSchema = z.object({
  id: z.string().optional(),
  index: z.number(),
  text: z.string().trim().min(1),
  startMs: z.number().nullable(),
  endMs: z.number().nullable(),
  source: z.enum(["text", "transcription", "manual"]),
});

const schema = z.object({
  segments: z.array(segmentSchema).min(1),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json();
    const params = await context.params;
    const input = schema.parse(body);
    const result = await updateMaterialSegmentsWorkflow(params.id, input.segments);

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to update segments.",
      400,
    );
  }
}
