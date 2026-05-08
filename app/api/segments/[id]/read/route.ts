import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { updateSegmentReadWorkflow } from "@/lib/services";

const schema = z.object({
  isRead: z.boolean(),
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
      await updateSegmentReadWorkflow({
        segmentId: params.id,
        isRead: input.isRead,
      }),
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to update sentence read status.",
      400,
    );
  }
}
