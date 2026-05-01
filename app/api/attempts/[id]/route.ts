import { jsonError, jsonOk } from "@/lib/api";
import { deleteAttemptWorkflow } from "@/lib/services";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    return jsonOk(await deleteAttemptWorkflow(params.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to delete recording history.",
      400,
    );
  }
}
