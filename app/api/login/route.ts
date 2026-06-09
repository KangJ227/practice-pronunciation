import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Login is disabled. The app opens with the default practice user." },
    { status: 410 },
  );
}
