import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { updateSegmentStarredWorkflow } from "@/lib/services";

const schema = z.object({
  starred: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const body = await request.json();
    const input = schema.parse(body);

    return jsonOk(
      await updateSegmentStarredWorkflow({
        segmentId: params.id,
        starred: input.starred,
      }),
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to update difficult sentence star.",
      400,
    );
  }
}
