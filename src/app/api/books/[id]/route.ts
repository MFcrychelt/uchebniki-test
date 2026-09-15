import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { adminGuard, staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bookAvailability } from "@/lib/availability";
import { findCover } from "@/lib/covers";

// Карточка учебника (для персонала): данные + классы, последние выдачи
// (кто сейчас держит, история) и ожидающие заявки.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const book = await db.orm.public.Book
    .where((b) => b.id.eq(id))
    .first();
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [classBooks, loans, pending] = await Promise.all([
    db.orm.public.ClassBook
      .where((cb) => cb.bookId.eq(id))
      .include("class")
      .all(),
    db.orm.public.Loan
      .where((l) => l.bookId.eq(id))
      .include("student", (s) => s.include("class"))
      .orderBy((l) => l.issuedAt.desc())
      .limit(10)
      .all(),
    db.orm.public.BookRequest
      .where((r) => r.bookId.eq(id) && r.status.eq("PENDING"))
      .include("student", (s) => s.include("class"))
      .orderBy((r) => r.createdAt.desc())
      .all(),
  ]);

  const studentInfo = (
    s: {
      id: string;
      lastName: string;
      firstName: string;
      class: { id: string; name: string } | null;
    } | null | undefined
  ) =>
    s
      ? {
          id: s.id,
          name: `${s.lastName} ${s.firstName}`,
          className: s.class?.name ?? null,
        }
      : null;

  const [avail, cover] = await Promise.all([
    bookAvailability(book.id),
    findCover(book.id),
  ]);

  return NextResponse.json({
    book: {
      id: book.id,
      isbn: book.isbn,
      title: book.title,
      subject: book.subject,
      copies: book.copies,
      grade: book.grade ?? null,
      available: avail.available,
      lost: avail.lost,
      hasCover: Boolean(cover),
    },
    classes: classBooks.map(
      (cb) => (cb.class as { name: string } | null)?.name ?? null
    ).filter((n): n is string => Boolean(n)),
    loans: loans.map((l) => ({
      id: l.id,
      status: l.status,
      issuedAt: (l.issuedAt as Temporal.Instant).toString(),
      returnedAt: l.returnedAt
        ? (l.returnedAt as Temporal.Instant).toString()
        : null,
      student: studentInfo(
        l.student as
          | {
              id: string;
              lastName: string;
              firstName: string;
              class: { id: string; name: string } | null;
            }
          | null
      ),
    })),
    pendingRequests: pending.map((r) => ({
      id: r.id,
      comment: r.comment ?? null,
      createdAt: (r.createdAt as Temporal.Instant).toString(),
      student: studentInfo(
        r.student as
          | {
              id: string;
              lastName: string;
              firstName: string;
              class: { id: string; name: string } | null;
            }
          | null
      ),
    })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const existing = await db.orm.public.Book.where({ id }).first();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = await db.orm.public.Book.where({ id }).delete();
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  void logAudit("book.delete", "book", guard.user, id, {
    title: existing.title,
    subject: existing.subject,
    isbn: existing.isbn,
  });

  return NextResponse.json({ ok: true });
}

// Изменить тираж (число экземпляров в фонде).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const copies = (body as { copies?: unknown })?.copies;
  if (typeof copies !== "number" || !Number.isInteger(copies) || copies < 1) {
    return NextResponse.json(
      { error: "copies — целое число ≥ 1" },
      { status: 400 }
    );
  }

  const existing = await db.orm.public.Book.where({ id }).first();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [outLoans, lostLoans] = await Promise.all([
    db.orm.public.Loan
      .where((l) => l.bookId.eq(id))
      .where((l) => l.status.eq("ISSUED"))
      .all(),
    db.orm.public.Loan
      .where((l) => l.bookId.eq(id))
      .where((l) => l.status.eq("LOST"))
      .all(),
  ]);
  const out = outLoans.length;
  const lost = lostLoans.length;
  if (copies < out + lost) {
    return NextResponse.json(
      { error: `Нельзя: выдано ${out}, списано ${lost} — тираж не меньше ${out + lost}` },
      { status: 400 }
    );
  }

  await db.orm.public.Book.where({ id }).update({ copies });
  void logAudit("book.update", "book", guard.user, id, {
    title: existing.title,
    copies: { from: existing.copies, to: copies },
  });

  return NextResponse.json({ ok: true, copies });
}
