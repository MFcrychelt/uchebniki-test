import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Отказать по заявке (книги нет / не для этого класса и т.п.).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const req = await db.orm.public.BookRequest
    .where({ id })
    .include("student")
    .include("book")
    .first();

  if (!req) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }
  if (req.status !== "PENDING") {
    return NextResponse.json(
      { error: "Заявка уже обработана" },
      { status: 409 }
    );
  }

  const student = req.student as { lastName: string; firstName: string } | null;
  const book = req.book as { title: string } | null;

  await db.orm.public.BookRequest.where({ id }).update({
    status: "DECLINED",
    handledAt: Temporal.Now.instant(),
    handledById: me.id,
  });

  void logAudit(
    "request.decline",
    "request",
    me,
    id,
    {
      student: student ? `${student.lastName} ${student.firstName}` : null,
      title: book?.title ?? null,
    }
  );

  return NextResponse.json({ ok: true, status: "DECLINED" });
}
