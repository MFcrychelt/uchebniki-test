import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { buildStudentProfile } from "@/lib/student-profile";

/**
 * Карточка ученика по id — только персонал (кабинет ученика работает по
 * личному QR-ключу: /api/student/qr/:token).
 *
 * `?profile=1` — ответ ровно тот же, что у QR-роута (чек-лист класса,
 * выдачи, остатки). Нужен экрану выдачи, когда карточки в классе не
 * печатали: без этого пути открыть ученика «по фамилии» было нечем, и
 * режим «весь класс пришёл» разваливался ровно в тот момент, когда он
 * нужнее всего.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;
  const wantsProfile = new URL(request.url).searchParams.get("profile");

  if (wantsProfile) {
    const profile = await buildStudentProfile({ id });
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  }

  // Явный select: без passwordHash/passwordEnc/inviteToken.
  const student = await db.orm.public.User.where({ id })
    .select(
      "id",
      "role",
      "lastName",
      "firstName",
      "classId",
      "login",
      "qrToken",
      "createdAt"
    )
    .include("class")
    .include("loans", (loans) =>
      loans.include("book").orderBy((l) => l.issuedAt.desc())
    )
    .first();

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}
