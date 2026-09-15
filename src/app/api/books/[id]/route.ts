import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { adminGuard, staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isbnVariants, normalizeIsbn } from "@/lib/isbn";
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

// Правка карточки учебника: название, предмет, ISBN, тираж — что прислали,
// то и меняем (частичный PATCH, как ждут оба клиента: «Книги» в админке и
// предпросмотр в каталоге библиотекаря).
//
// Доступно ЛЮБОМУ сотруднику, а не только администратору: учебник в каталог
// библиотекарь заводит сам (POST /api/books), значит и исправить опечатку в
// названии или перепутанный штрихкод он должен на месте, а не ждать админа
// и не «чинить» запись удалением + созданием (это рвёт историю выдач).
// Удаление — по-прежнему только администратор (DELETE выше).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;

  const existing = await db.orm.public.Book.where({ id }).first();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: {
    title?: string;
    subject?: string;
    isbn?: string;
    copies?: number;
  } = {};

  // Текстовые поля проверяем только если они вообще присланы: PATCH
  // приходит и с одним «copies» (инлайн-правка тиража в списке).
  for (const key of ["title", "subject"] as const) {
    if (raw[key] === undefined) continue;
    const value = typeof raw[key] === "string" ? raw[key].trim() : "";
    if (!value) {
      return NextResponse.json(
        { error: `«${key === "title" ? "Название" : "Предмет"}» не может быть пустым` },
        { status: 400 }
      );
    }
    patch[key] = value;
  }

  if (raw.isbn !== undefined) {
    const isbn = typeof raw.isbn === "string" ? raw.isbn.trim() : "";
    // Пробелы и дефисы внутри штрихкода — человек вводит с листа.
    const normalized = normalizeIsbn(isbn);
    if (!normalized) {
      return NextResponse.json(
        { error: "ISBN не может быть пустым" },
        { status: 400 }
      );
    }
    if (normalized !== existing.isbn) {
      const dup = await db.orm.public.Book
        .where((b) => b.isbn.in(isbnVariants(normalized)))
        .first();
      if (dup) {
        return NextResponse.json(
          { error: `ISBN ${normalized} уже закреплён за «${dup.title}»` },
          { status: 409 }
        );
      }
    }
    patch.isbn = normalized;
  }

  if (raw.copies !== undefined) {
    const copies = raw.copies;
    if (typeof copies !== "number" || !Number.isInteger(copies) || copies < 1) {
      return NextResponse.json(
        { error: "copies — целое число ≥ 1" },
        { status: 400 }
      );
    }
    // Тираж нельзя уменьшить ниже того, что уже на руках и списано.
    // Не меняли тираж — не проверяем: иначе правка опечатки в названии
    // упиралась бы в «выдано 3, тираж 2» (а такое расхождение в фонде
    // живёт годами и к названию отношения не имеет).
    if (copies === existing.copies) {
      patch.copies = copies;
    } else {
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
    const min = outLoans.length + lostLoans.length;
    if (copies < min) {
      return NextResponse.json(
        {
          error: `Нельзя: выдано ${outLoans.length}, списано ${lostLoans.length} — тираж не меньше ${min}`,
        },
        { status: 400 }
      );
    }
    patch.copies = copies;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  await db.orm.public.Book.where({ id }).update(patch);
  const updated = await db.orm.public.Book.where({ id }).first();

  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    const k = key as keyof typeof patch;
    diff[k] = { from: existing[k], to: patch[k] };
  }
  void logAudit("book.update", "book", me, id, diff);

  const avail = await bookAvailability(id);
  return NextResponse.json({
    ok: true,
    book: {
      id: id,
      isbn: updated?.isbn ?? patch.isbn ?? existing.isbn,
      title: updated?.title ?? patch.title ?? existing.title,
      subject: updated?.subject ?? patch.subject ?? existing.subject,
      copies: updated?.copies ?? patch.copies ?? existing.copies,
      grade: updated?.grade ?? existing.grade ?? null,
      available: avail.available,
      lost: avail.lost,
      hasCover: Boolean(await findCover(id)),
    },
  });
}
