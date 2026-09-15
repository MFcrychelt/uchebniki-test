import { NextResponse } from "next/server";
import {
  STUDENT_SESSION_COOKIE,
  sessionCookieValue,
  sessionTtlSec,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/prisma";
import {
  RULE_LOGIN_BUDGET,
  RULE_STUDENT_LOGIN,
  authLimiter,
  loginKey,
  tooManyRequests,
} from "@/lib/rate-limit";

// Вход ученика по логину/паролю (система сама их создаёт при импорте
// класса; логин и пароль видны в кабинете). Сессия — 30 дней.
export async function POST(request: Request) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const login = (body.login ?? "").trim();
  const password = body.password ?? "";
  if (!login || !password) {
    return NextResponse.json(
      { error: "Введите логин и пароль" },
      { status: 400 }
    );
  }

  // Пароль ученику выдаёт система (8 символов с карточки), и промахиваются по
  // нему часто — порог мягче, чем у персонала, но и он конечен: логин вида
  // «ivanov-xxxx» перебирается по словарику фамилий.
  const budgetKey = "login:student:budget";
  const attemptKey = loginKey(request, "student", login);
  for (const [key, rule] of [
    [attemptKey, RULE_STUDENT_LOGIN],
    [budgetKey, RULE_LOGIN_BUDGET],
  ] as const) {
    const gate = authLimiter.blocked(key, rule);
    if (!gate.allowed) return tooManyRequests(gate);
  }

  const user = await db.orm.public.User
    .where((u) => u.login.eq(login))
    .where((u) => u.role.eq("STUDENT"))
    .first();

  // Одна и та же ошибка для «нет такого логина» и «неверный пароль».
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    authLimiter.recordFailure(attemptKey, RULE_STUDENT_LOGIN);
    authLimiter.recordFailure(budgetKey, RULE_LOGIN_BUDGET);
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const sessionUser = {
    id: user.id,
    role: "STUDENT" as const,
    lastName: user.lastName,
    firstName: user.firstName,
  };

  // qrToken отдаём, чтобы клиент сразу открыл кабинет прежним способом.
  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      role: user.role,
      name: `${user.lastName} ${user.firstName}`,
    },
    qrToken: user.qrToken,
  });
  const { value, options } = sessionCookieValue(
    signSessionToken(sessionUser),
    sessionTtlSec("STUDENT")
  );
  res.cookies.set(STUDENT_SESSION_COOKIE, value, options);

  void logAudit("auth.student.login", "auth", sessionUser, user.id, {
    name: `${user.lastName} ${user.firstName}`,
  });

  return res;
}
