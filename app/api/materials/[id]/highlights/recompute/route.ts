import { recomputeHighlightsWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    return jsonOk(recomputeHighlightsWorkflow(params.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to recompute highlights.",
      404,
    );
  }
}
