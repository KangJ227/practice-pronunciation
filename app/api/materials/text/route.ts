import { z } from "zod";
import { createTextMaterialWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  title: z.string().trim().optional().default(""),
  text: z.string().trim().min(1, "Text is required."),
  referenceMode: z
    .enum(["sentence-tts", "elevenlabs-source"])
    .optional()
    .default("sentence-tts"),
});

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    let text = String(formData.get("text") ?? "");

    if (!text && file instanceof File) {
      text = await file.text();
    }

    const input = schema.parse({
      title: String(formData.get("title") ?? ""),
      text,
      referenceMode: String(formData.get("referenceMode") ?? "sentence-tts"),
    });

    const result = await createTextMaterialWorkflow(input);

    return jsonOk({
      material: result.material,
      redirectTo: `/materials/${result.material.id}/edit`,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to create text material.",
      400,
    );
  }
}
