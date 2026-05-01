import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createAudioMaterialUploadWorkflow } from "@/lib/services";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().optional().default(""),
  filename: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return jsonOk(await createAudioMaterialUploadWorkflow(input));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to prepare audio upload.",
      400,
    );
  }
}
