import { jsonError, jsonOk } from "@/lib/api";
import { deleteMaterialsWorkflow } from "@/lib/services";

type DeleteMaterialsPayload = {
  ids?: unknown;
};

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as DeleteMaterialsPayload;
    if (!Array.isArray(payload.ids) || !payload.ids.every((id) => typeof id === "string")) {
      return jsonError("Expected an ids array.", 400);
    }

    return jsonOk(await deleteMaterialsWorkflow(payload.ids));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to delete selected sessions.",
      400,
    );
  }
}
