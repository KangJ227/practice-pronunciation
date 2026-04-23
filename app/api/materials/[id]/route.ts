import { jsonError, jsonOk } from "@/lib/api";
import { deleteMaterialWorkflow } from "@/lib/services";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const material = await deleteMaterialWorkflow(params.id, { onlyIfError: true });

    return jsonOk({ material });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to delete ERROR session.",
      400,
    );
  }
}
