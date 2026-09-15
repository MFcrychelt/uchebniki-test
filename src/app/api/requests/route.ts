import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";

// Очередь заявок: ?status=PENDING|ISSUED|DECLINED (по умолчанию PENDING),
// ?limit= (до 200). Новые сверху.
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 100) || 100,
    200
  );

  let query = db.orm.public.BookRequest
    .include("student", (s) => s.include("class"))
    .include("book")
    .include("handledBy");

  if (status === "PENDING" || status === "ISSUED" || status === "DECLINED") {
    query = query.where((r) => r.status.eq(status));
  }

  const rows = await query
    .orderBy((r) => r.createdAt.desc())
    .limit(limit)
    .all();

  const items = rows.map((r) => {
    const student = r.student as {
      id: string;
      lastName: string;
      firstName: string;
      class: { id: string; name: string } | null;
    } | null;
    const book = r.book as { id: string; isbn: string; title: string; subject: string } | null;
    const handledBy = r.handledBy as { lastName: string; firstName: string } | null;
    return {
      id: r.id,
      status: r.status,
      comment: r.comment ?? null,
      createdAt: (r.createdAt as Temporal.Instant).toString(),
      handledAt: r.handledAt ? (r.handledAt as Temporal.Instant).toString() : null,
      student: student ? {
        id: student.id,
        lastName: student.lastName,
        firstName: student.firstName,
        className: student.class?.name ?? null,
      } : null,
      book: book ? {
        id: book.id,
        isbn: book.isbn,
        title: book.title,
        subject: book.subject,
      } : null,
      handledBy: handledBy ? `${handledBy.lastName} ${handledBy.firstName}` : null,
    };
  }).filter((it) => it.student && it.book);

  return NextResponse.json(items);
}
