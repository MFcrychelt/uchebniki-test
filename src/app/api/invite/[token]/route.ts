import { Temporal } from "@js-temporal/polyfill";
import { NextResponse } from "next/server";
import {
  STUDENT_SESSION_COOKIE,
  sessionTtlSec,
  signSessionToken,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { tokenProbe } from "@/lib/rate-limit";
import { db } from "@/lib/prisma";

/**
 * Магическая ссылка ученика: GET /api/invite/<одноразовый-токен>.
 *
 * Страница /invite/<токен> пересылает сюда: в route handler можно ставить
 * cookie (в server-компоненте — нельзя). Ученик кликает по ссылке
 * (мессенджер или QR) — сервер атомарно расходует токен, ставит
 * httpOnly-cookie сессии на 30 дней и редиректит в личный кабинет.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const base = request.url;

  // Ссылка одноразовая и публичная по замыслу — но перебирать её тоже
  // бессмысленно дорого не даём (см. src/lib/rate-limit.ts).
  const probe = tokenProbe(request, "invite");
  const stop = probe.gate();
  if (stop) return stop;

  const user = await db.orm.public.User
    .where((u) => u.inviteToken.eq(token))
    .first();

  if (!user || user.role !== "STUDENT" || user.inviteUsedAt) {
    probe.noteNotFound();
    return NextResponse.redirect(new URL("/invite/invalid", base), 302);
  }

  // Атомарное расходование: только один из конкурентных запросов пройдёт
  // (inviteUsedAt ещё null). Второй увидит «уже использована».
  const consumed = await db.orm.public.User
    .where((u) => u.id.eq(user.id))
    .where((u) => u.inviteUsedAt.isNull())
    .update({ inviteUsedAt: Temporal.Now.instant() });

  if (!consumed) {
    return NextResponse.redirect(new URL("/invite/invalid", base), 302);
  }

  const sessionUser = {
    id: user.id,
    role: "STUDENT" as const,
    lastName: user.lastName,
    firstName: user.firstName,
  };

  const res = NextResponse.redirect(new URL("/student", base), 302);
  res.cookies.set(STUDENT_SESSION_COOKIE, signSessionToken(sessionUser), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSec("STUDENT"),
  });

  void logAudit("auth.invite", "auth", sessionUser, user.id, {
    name: `${user.lastName} ${user.firstName}`,
  });

  return res;
}
