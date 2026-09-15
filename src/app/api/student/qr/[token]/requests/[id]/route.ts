import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

// Отмена своей заявки (только PENDING).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

  const student = await db.orm.public.User.where((u) => u.qrToken.eq(token)).first();
  if (!student) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const existing = await db.orm.public.BookRequest
    .where({ id })
    .where((r) => r.studentId.eq(student.id))
    .first();

  if (!existing) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "Заявка уже обработана" },
      { status: 409 }
    );
  }

  const removed = await db.orm.public.BookRequest.where({ id }).delete();
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
