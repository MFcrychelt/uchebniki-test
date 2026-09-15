import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";

// Статистика для дашборда библиотекаря.
export async function GET() {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const loanQuery = db.orm.public.Loan
    .include("student", (s) => s.include("class"))
    .include("book");

  const [loans, books, students, classes] = await Promise.all([
    loanQuery.all(),
    db.orm.public.Book.all(),
    db.orm.public.User.where((u) => u.role.eq("STUDENT")).all(),
    db.orm.public.Class.all(),
  ]);

  const bySubject = new Map<string, number>();
  const byClass = new Map<string, number>();
  const byBook = new Map<string, { isbn: string; title: string; subject: string; count: number; active: number }>();

  for (const l of loans) {
    const book = l.book as { id: string; isbn: string; title: string; subject: string } | null;
    const student = l.student as {
      class: { id: string; name: string } | null;
    } | null;

    const subj = book?.subject ?? "—";
    const cls = student?.class?.name ?? "—";
    const active = l.status === "ISSUED";

    if (active) {
      bySubject.set(subj, (bySubject.get(subj) ?? 0) + 1);
      byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
    }

    if (book) {
      const entry =
        byBook.get(book.id) ??
        { isbn: book.isbn, title: book.title, subject: book.subject, count: 0, active: 0 };
      entry.count++;
      if (active) entry.active++;
      byBook.set(book.id, entry);
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    totals: {
      books: books.length,
      students: students.length,
      classes: classes.length,
      active: loans.filter((l) => l.status === "ISSUED").length,
      returned: loans.filter((l) => l.status === "RETURNED").length,
      lost: loans.filter((l) => l.status === "LOST").length,
    },
    activeBySubject: sortDesc(bySubject),
    activeByClass: sortDesc(byClass),
    topBooks: [...byBook.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  });
}
