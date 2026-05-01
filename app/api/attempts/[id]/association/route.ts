import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { updateAttemptAssociationWorkflow } from "@/lib/services";

const schema = z.object({
  segmentId: z.string().trim().min(1),
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
      await updateAttemptAssociationWorkflow({
        attemptId: params.id,
        segmentId: input.segmentId,
      }),
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to associate recording history.",
      400,
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    return jsonOk(
      await updateAttemptAssociationWorkflow({
        attemptId: params.id,
        segmentId: null,
      }),
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to unassociate recording history.",
      400,
    );
  }
}
