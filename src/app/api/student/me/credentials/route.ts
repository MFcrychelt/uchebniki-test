import { NextResponse } from "next/server";
import { studentUser } from "@/lib/auth";
import { decryptPassword } from "@/lib/student-credentials";
import { db } from "@/lib/prisma";

// Логин и пароль ученика для показа в кабинете.
// Только по собственной cookie-сессии ученика: пароль — секрет,
// по чужому QR-токену его не выдаём (см. /api/student/qr/:token).
export async function GET() {
  const user = await studentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const full = await db.orm.public.User.where({ id: user.id }).first();
  if (!full?.login || !full.passwordEnc) {
    return NextResponse.json(
      { error: "Данные для входа ещё не созданы" },
      { status: 404 }
    );
  }

  const password = decryptPassword(full.passwordEnc);
  if (!password) {
    return NextResponse.json(
      {
        error:
          "Не удалось показать пароль (ключ шифрования в настройках сервера изменился). Попросите администратора назначить новый пароль — в разделе «Ссылки».",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ login: full.login, password });
}
