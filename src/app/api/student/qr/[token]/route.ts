import { NextResponse } from "next/server";
import { tokenProbe } from "@/lib/rate-limit";
import { buildStudentProfile } from "@/lib/student-profile";

/**
 * Профиль ученика по личному QR-ключу (со смартфона или с карточки).
 * Публичен по замыслу: доступ даёт секретный токен с карточки, сессия не
 * нужна — иначе ребёнок не открыл бы свой список на своём телефоне.
 * Секретные поля (passwordHash / passwordEnc / inviteToken) в ответ их
 * нет — см. select в src/lib/student-profile.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Токен — 122 бита из uuidv4, но маршрут публичный и отвечает на «есть
  // такой ученик» — значит по нему можно и перебирать, и грузить БД. Неудачи
  // считаем, успешные открытия — нет (кабинет открывается часто).
  const probe = tokenProbe(request, "qr");
  const stop = probe.gate();
  if (stop) return stop;

  const profile = await buildStudentProfile({ qrToken: token });
  if (!profile) {
    probe.noteNotFound();
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}
