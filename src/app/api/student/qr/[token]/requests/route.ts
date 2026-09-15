import { NextResponse } from "next/server";
import type { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

// Заявки ученика на учебники. Идентификация — QR-токен (как во всём
// ученическом flow: у учеников нет логина).
// POST { bookId, comment? } — создать заявку (409, если уже есть активная).
// GET — заявки ученика (новые сверху).

async function studentByToken(token: string) {
  return db.orm.public.User.where((u) => u.qrToken.eq(token)).first();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const student = await studentByToken(token);
  if (!student) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  let body: { bookId?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидался JSON" }, { status: 400 });
  }

  const bookId = body.bookId;
  const comment = body.comment?.trim() || null;
  if (!bookId) {
    return NextResponse.json({ error: "Нужен bookId" }, { status: 400 });
  }

  const book = await db.orm.public.Book.where({ id: bookId }).first();
  if (!book) {
    return NextResponse.json({ error: "Учебник не найден" }, { status: 404 });
  }
  if (book.grade == null) {
    return NextResponse.json(
      { error: "Этот учебник не выдаётся в этом году" },
      { status: 409 }
    );
  }

  // Активная заявка на эту книгу уже есть?
  const pending = await db.orm.public.BookRequest
    .where((r) => r.studentId.eq(student.id))
    .where((r) => r.bookId.eq(bookId))
    .where((r) => r.status.eq("PENDING"))
    .first();

  if (pending) {
    return NextResponse.json(
      { error: "Заявка на этот учебник уже есть" },
      { status: 409 }
    );
  }

  const req = await db.orm.public.BookRequest.create({
    studentId: student.id,
    bookId,
    comment,
    status: "PENDING",
  });

  return NextResponse.json(req, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const student = await studentByToken(token);
  if (!student) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const rows = await db.orm.public.BookRequest
    .where((r) => r.studentId.eq(student.id))
    .include("book")
    .orderBy((r) => r.createdAt.desc())
    .all();

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      bookId: r.bookId,
      status: r.status,
      comment: r.comment ?? null,
      createdAt: (r.createdAt as Temporal.Instant).toString(),
      handledAt: r.handledAt ? (r.handledAt as Temporal.Instant).toString() : null,
      book: r.book as { id: string; isbn: string; title: string; subject: string },
    }))
  );
}
