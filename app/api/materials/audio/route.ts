import { createAudioMaterialWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Please upload an audio file.");
    }

    const result = await createAudioMaterialWorkflow({
      title: String(formData.get("title") ?? ""),
      file,
    });

    return jsonOk({
      material: result.material,
      redirectTo: `/materials/${result.material.id}/edit`,
      transcription: result.transcription,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to create audio material.",
      400,
    );
  }
}
