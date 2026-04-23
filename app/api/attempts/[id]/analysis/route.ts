import { jsonError, jsonOk } from "@/lib/api";
import { analyzeAttemptWorkflow } from "@/lib/services";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    return jsonOk(await analyzeAttemptWorkflow(params.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to generate AI feedback.",
      400,
    );
  }
}
