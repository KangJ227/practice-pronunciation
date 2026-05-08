import { z } from "zod";
import { getSettingsView, updateSettingsWorkflow } from "@/lib/services";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  ttsVoice: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    return jsonOk({ settings: await getSettingsView() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to load settings.", 401);
  }
}

export async function PATCH(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return jsonOk({ settings: await updateSettingsWorkflow(input) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to save settings.", 400);
  }
}
