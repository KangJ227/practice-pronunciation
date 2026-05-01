import { getPracticeMaterialView } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    return jsonOk(await getPracticeMaterialView(params.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to load practice view.",
      404,
    );
  }
}
