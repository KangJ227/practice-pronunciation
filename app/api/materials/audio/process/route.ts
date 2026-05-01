import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { processAudioMaterialUploadWorkflow } from "@/lib/services";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  materialId: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  filename: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const result = await processAudioMaterialUploadWorkflow(input);

    return jsonOk({
      material: result.material,
      redirectTo: `/materials/${result.material.id}/edit`,
      transcription: result.transcription,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to process audio upload.",
      400,
    );
  }
}
