import { NextResponse } from "next/server";
import {
  STAFF_SESSION_COOKIE,
  sessionCookieValue,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

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

  const user = await db.orm.public.User
    .where((u) => u.login.eq(login))
    .first();

  // Одна и та же ошибка для «нет такого логина» и «неверный пароль».
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }
  if (user.role === "STUDENT") {
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
