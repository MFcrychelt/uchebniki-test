import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Отсоединить учебник от класса. Доступно библиотекарю на странице класса.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; bookId: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id: classId, bookId } = await params;

  const book = await db.orm.public.Book.where({ id: bookId }).first();
  const removed = await db.orm.public.ClassBook
    .where((cb) => cb.classId.eq(classId))
    .where((cb) => cb.bookId.eq(bookId))
    .delete();

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  void logAudit(
    "classbook.unlink",
    "classbook",
    me,
    classId,
    { bookId, title: book?.title ?? null, isbn: book?.isbn ?? null }
  );
  return NextResponse.json({ ok: true });
}
