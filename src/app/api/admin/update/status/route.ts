import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { getUpdateStatus } from "@/lib/update";

// Статус обновления: текущая версия + отставание от origin + состояние
// фоновой задачи. ?refresh=1 — принудительно повторить git fetch.
export async function GET(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  const status = await getUpdateStatus(force);
  return NextResponse.json(status);
}
