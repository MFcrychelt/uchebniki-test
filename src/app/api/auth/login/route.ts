import { NextResponse } from "next/server";
import {
  STAFF_SESSION_COOKIE,
  sessionCookieValue,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  RULE_LOGIN_BUDGET,
  RULE_STAFF_LOGIN,
  authLimiter,
  loginKey,
  tooManyRequests,
} from "@/lib/rate-limit";

// Вход персонала: { login, password } → сессия в httpOnly-cookie.
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

  // Лимиты проверяем ДО проверки пароля, но считаем только неудачу: иначе
  // успешный вход в начале смены съедал бы бюджет «перебора» у коллег.
  const budgetKey = "login:staff:budget";
  const attemptKey = loginKey(request, "staff", login);
  for (const [key, rule] of [
    [attemptKey, RULE_STAFF_LOGIN],
    [budgetKey, RULE_LOGIN_BUDGET],
  ] as const) {
    const gate = authLimiter.blocked(key, rule);
    if (!gate.allowed) return tooManyRequests(gate);
  }

  const noteFailure = () => {
    authLimiter.recordFailure(attemptKey, RULE_STAFF_LOGIN);
    authLimiter.recordFailure(budgetKey, RULE_LOGIN_BUDGET);
  };

  const user = await db.orm.public.User
    .where((u) => u.login.eq(login))
    .first();

  // Одна и та же ошибка для «нет такого логина» и «неверный пароль».
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    noteFailure();
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }
  if (user.role === "STUDENT") {
    noteFailure();
    return NextResponse.json(
      {
        error:
          "Ученики входят в личном кабинете (/student): по ссылке от учителя, логину с паролем или QR-коду",
      },
      { status: 403 }
    );
  }

  const token = signSessionToken({
    id: user.id,
    role: user.role,
    lastName: user.lastName,
    firstName: user.firstName,
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      role: user.role,
      name: `${user.lastName} ${user.firstName}`,
    },
  });
  const { value, options } = sessionCookieValue(token);
  res.cookies.set(STAFF_SESSION_COOKIE, value, options);

  // Аудит входа (не блокирует ответ).
  void logAudit(
    "auth.login",
    "auth",
    { id: user.id, role: user.role, lastName: user.lastName, firstName: user.firstName }
  );

  return res;
}
