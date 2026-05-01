import { jsonError, jsonOk } from "@/lib/api";
import { deleteErrorMaterialsWorkflow } from "@/lib/services";

export async function DELETE() {
  try {
    return jsonOk(await deleteErrorMaterialsWorkflow());
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to delete ERROR sessions.",
      400,
    );
  }
}
