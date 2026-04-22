import { submitAttemptWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Please upload an audio file for scoring.");
    }

    const result = await submitAttemptWorkflow({
      segmentId: params.id,
      file,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to score attempt.",
      400,
    );
  }
}
