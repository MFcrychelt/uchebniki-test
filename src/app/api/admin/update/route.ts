import { NextResponse } from "next/server";
import { adminGuard, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { startUpdate } from "@/lib/update";
import { db } from "@/lib/prisma";

// Запуск обновления: git pull → npm ci (при изменении lock) → build →
// перезапуск (RESTART_CMD или выход процесса). Подтверждение — пароль
// администратора повторно вводится (страховка от перехваченной сессии).
export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ожидался JSON { password }" },
      { status: 400 }
    );
  }

  const admin = await db.orm.public.User
    .where({ id: guard.user.id })
    .select("passwordHash")
    .first();
  if (!admin?.passwordHash || !verifyPassword(body.password ?? "", admin.passwordHash)) {
    return NextResponse.json(
      { error: "Неверный пароль администратора" },
      { status: 403 }
    );
  }

  const result = startUpdate();
  if (!result.started) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  void logAudit("update.start", "update", guard.user, null, {
    branch: "current",
  });

  return NextResponse.json({ started: true });
}
