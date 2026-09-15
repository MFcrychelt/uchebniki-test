import { currentUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
import StudentPageClient from "./student-page-client";

/**
 * Личный кабинет ученика.
 *
 * Вход в кабинет — тремя способами (M22–M23):
 *  1. Одноразовая magic link от учителя: /invite/<токен> → cookie-сессия
 *     на 30 дней (страница расходует ссылку и редиректит сюда).
 *  2. Логин + пароль (система сама их создаёт; видны в кабинете).
 *  3. Личный QR-код: ?qr=<токен> (сканер приложения или камера телефона).
 *
 * Если ученик уже вошёл по cookie (способы 1–2), сервер открывает его
 * кабинет: передаём клиенту его qrToken как initialQr. Список учеников
 * анонимам по-прежнему не показывается.
 */
export default async function StudentPage() {
  let initialQr: string | null = null;
  const user = await currentUser();
  if (user?.role === "STUDENT") {
    const student = await db.orm.public.User
      .where({ id: user.id })
      .select("qrToken")
      .first();
    initialQr = student?.qrToken ?? null;
  }

  return <StudentPageClient initialQr={initialQr} />;
}
