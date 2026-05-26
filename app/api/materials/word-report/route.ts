import { jsonError } from "@/lib/api";
import { getLowWordScoreReportWorkflow } from "@/lib/services";
import {
  renderLowWordScoreReportMarkdown,
  renderLowWordScoreReportPdf,
} from "@/lib/word-score-report";

type WordReportPayload = {
  ids?: unknown;
  format?: unknown;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WordReportPayload;
    if (!Array.isArray(payload.ids) || !payload.ids.every((id) => typeof id === "string")) {
      return jsonError("Expected an ids array.", 400);
    }

    if (payload.format !== "md" && payload.format !== "pdf") {
      return jsonError("Expected format to be md or pdf.", 400);
    }

    const report = await getLowWordScoreReportWorkflow(payload.ids);
    const dateStamp = report.generatedAt.slice(0, 10);
    const filename = `low-word-score-report-${dateStamp}.${payload.format}`;

    if (payload.format === "pdf") {
      return new Response(renderLowWordScoreReportPdf(report), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return new Response(renderLowWordScoreReportMarkdown(report), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to build word score report.",
      400,
    );
  }
}
