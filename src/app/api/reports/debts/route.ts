import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";

export interface DebtItem {
  loanId: string;
  issuedAt: string;
  student: {
    id: string;
    lastName: string;
    firstName: string;
    qrToken: string | null;
    classId: string | null;
    class: { id: string; name: string } | null;
  };
  book: {
    id: string;
    isbn: string;
    title: string;
    subject: string;
  };
}

// Отчёт «Долги»: все активные выдачи (ISSUED).
// Фильтры: ?classId= (по классу ученика), ?subject= (по предмету).
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const subject = url.searchParams.get("subject");

  let query = db.orm.public.Loan
    .where((l) => l.status.eq("ISSUED"))
    .include("student", (s) => s.include("class"))
    .include("book");

  if (classId) {
    query = query.where((l) => l.student.some((s) => s.classId.eq(classId)));
  }
  if (subject) {
    query = query.where((l) => l.book.some((b) => b.subject.eq(subject)));
  }

  const rows = await query
    .orderBy((l) => l.issuedAt.asc())
    .all();

  const items: DebtItem[] = rows
    .map((r) => {
      const student = r.student as DebtItem["student"];
      const book = r.book as DebtItem["book"];
      return {
        loanId: r.id,
        issuedAt: r.issuedAt.toString(),
        student,
        book,
      };
    })
    .filter((it) => it.student && it.book);

  return NextResponse.json(items);
}
