import { NextResponse } from "next/server";
import { clearSessionCookies, currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Выход: сбрасываем все cookie сессии (персонал, ученик и устаревшее `session`).
export async function POST() {
  const user = await currentUser();
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  if (user) void logAudit("auth.logout", "auth", user);
  return res;
}
