import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { buildStocktakeReport } from "@/lib/stocktake";

/**
 * Инвентаризация: POST { isbn: string[], classId?: string | null } → отчёт
 * о расхождениях между отсканированными книгами, каталогом и активными
 * выдачами. Stateless: сессия сканов живёт в браузере (localStorage).
 * Ссылка на класс ограничивает переучёт его учебниками.
 */
export async function POST(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { isbn, classId } = (body ?? {}) as {
    isbn?: unknown;
    classId?: unknown;
  };

  if (!Array.isArray(isbn) || isbn.length > 1000 || isbn.some((x) => typeof x !== "string")) {
    return NextResponse.json(
      { error: "isbn — массив строк (не более 1000)" },
      { status: 400 }
    );
  }

  let className: string | undefined;
  if (classId) {
    if (typeof classId !== "string") {
      return NextResponse.json({ error: "classId — строка" }, { status: 400 });
    }
    const cls = await db.orm.public.Class.where((c) => c.id.eq(classId)).first();
    if (!cls) {
      return NextResponse.json({ error: "Класс не найден" }, { status: 404 });
    }
    className = cls.name;
  }

  // Каталог с именами классов (книга ↔ класс через ClassBook).
  const books = await db.orm.public.Book
    .include("classes", (cb) => cb.include("class"))
    .all();

  // Списанные копии (LOST): они не ждут в башне — вычитаются из ожидаемых.
  const lostLoans = await db.orm.public.Loan
    .where((l) => l.status.eq("LOST"))
    .include("book")
    .all();
  const lostByBook = new Map<string, number>();
  for (const l of lostLoans) {
    const bookId = (l.book as { id: string } | null)?.id;
    if (bookId) lostByBook.set(bookId, (lostByBook.get(bookId) ?? 0) + 1);
  }

  const catalog = books.map((b) => {
    const classes = b.classes as { class?: { name: string } | null }[];
    return {
      bookId: b.id,
      isbn: b.isbn,
      title: b.title,
      subject: b.subject,
      copies: b.copies,
      lost: lostByBook.get(b.id) ?? 0,
      classNames: classes
        .map((cb) => cb.class?.name)
        .filter((n): n is string => Boolean(n)),
    };
  });

  // Активные выдачи (кто, что, когда).
  const loans = await db.orm.public.Loan
    .where((l) => l.status.eq("ISSUED"))
    .include("student", (s) => s.include("class"))
    .include("book")
    .all();

  const issuedLoans = loans
    .map((l) => {
      const student = l.student as { lastName: string; firstName: string; class?: { name: string } | null } | null;
      const book = l.book as { isbn: string; title: string } | null;
      if (!student || !book) return null;
      return {
        loanId: l.id,
        isbn: book.isbn,
        title: book.title,
        student: `${student.lastName} ${student.firstName}`,
        className: student.class?.name ?? null,
        issuedAt: l.issuedAt.toString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const report = buildStocktakeReport({
    scanned: isbn as string[],
    classId: typeof classId === "string" ? classId : null,
    className,
    catalog,
    issuedLoans,
  });

  return NextResponse.json(report);
}
