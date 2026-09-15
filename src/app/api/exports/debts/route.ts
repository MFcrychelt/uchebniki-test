import { NextResponse } from "next/server";
import { staffUser } from "@/lib/auth";
import { CSV_HEADERS, csvContent, ruDate } from "@/lib/csv";
import { db } from "@/lib/prisma";

// Экспорт отчёта «Долги» в CSV (те же фильтры, что у /api/reports/debts).
export async function GET(request: Request) {
  const me = await staffUser();
  if (!me) {
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

  const rows = await query.orderBy((l) => l.issuedAt.asc()).all();

  const data = rows
    .map((r) => {
      const student = r.student as {
        lastName: string;
        firstName: string;
        class: { name: string } | null;
      } | null;
      const book = r.book as { title: string; subject: string; isbn: string } | null;
      if (!student || !book) return null;
      return [
        `${student.lastName} ${student.firstName}`,
        student.class?.name ?? "—",
        book.subject,
        book.title,
        book.isbn,
        ruDate(r.issuedAt.toString()),
      ];
    })
    .filter((r): r is string[] => r !== null);

  const body = csvContent(
    ["Ученик", "Класс", "Предмет", "Учебник", "ISBN", "Дата выдачи"],
    data
  );

  return new NextResponse(body, {
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="debts-${Date.now()}.csv"`,
    },
  });
}
