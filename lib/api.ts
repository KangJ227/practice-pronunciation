import { NextResponse } from "next/server";

export const jsonOk = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, init);

export const jsonError = (message: string, status = 400, details?: unknown) =>
  NextResponse.json(
    {
      error: message,
      details: details ?? null,
    },
    { status },
  );
