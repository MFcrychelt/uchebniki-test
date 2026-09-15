import { NextResponse } from "next/server";
import { getGitVersion } from "@/lib/version";

// Текущая версия развёрнутого кода (git HEAD) — для подвала и UI.
export async function GET() {
  const version = await getGitVersion();
  return NextResponse.json({ version });
}
