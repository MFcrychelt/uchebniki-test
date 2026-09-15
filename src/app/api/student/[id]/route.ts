import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";

// Карточка ученика по id — только персонал (кабинет ученика работает
// по личному QR-ключу: /api/student/qr/:token).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  // Явный select: без passwordHash/passwordEnc/inviteToken.
  const student = await db.orm.public.User
    .where({ id })
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
