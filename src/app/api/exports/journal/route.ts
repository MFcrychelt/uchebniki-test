import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { staffUser } from "@/lib/auth";
import { CSV_HEADERS, csvContent, ruDate } from "@/lib/csv";
import { db } from "@/lib/prisma";

const STATUS_RU: Record<string, string> = {
  ISSUED: "выдана",
  RETURNED: "возвращена",
  LOST: "утеряна",
};

// Экспорт журнала в CSV (те же фильтры, что у GET /api/loans).
export async function GET(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const classId = url.searchParams.get("classId");
  const subject = url.searchParams.get("subject");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = db.orm.public.Loan
    .include("student", (s) => s.include("class"))
    .include("book")
    .include("librarian");

  if (status === "ISSUED" || status === "RETURNED" || status === "LOST") {
    query = query.where((l) => l.status.eq(status));
  }
  if (classId) {
    query = query.where((l) => l.student.some((s) => s.classId.eq(classId)));
  }
  if (subject) {
    query = query.where((l) => l.book.some((b) => b.subject.eq(subject)));
  }
  if (from) {
    query = query.where((l) =>
      l.issuedAt.gte(Temporal.Instant.from(`${from}T00:00:00Z`))
    );
  }
  if (to) {
    query = query.where((l) =>
      l.issuedAt.lte(Temporal.Instant.from(`${to}T23:59:59Z`))
    );
  }

  const rows = await query.orderBy((l) => l.issuedAt.desc()).all();

  const data = rows.map((r) => {
    const student = r.student as {
      lastName: string;
      firstName: string;
      class: { name: string } | null;
    } | null;
    const book = r.book as { title: string; subject: string; isbn: string } | null;
    const librarian = r.librarian as {
      lastName: string;
      firstName: string;
    } | null;
    return [
      ruDate(r.issuedAt.toString()),
      `${student?.lastName ?? "—"} ${student?.firstName ?? ""}`.trim(),
      student?.class?.name ?? "—",
      book?.subject ?? "—",
      book?.title ?? "—",
      book?.isbn ?? "—",
      STATUS_RU[r.status] ?? r.status,
      ruDate(r.returnedAt ? r.returnedAt.toString() : null),
      librarian ? `${librarian.lastName} ${librarian.firstName}` : "—",
      ruDate(r.compensatedAt ? r.compensatedAt.toString() : null),
    ];
  });

  const body = csvContent(
    [
      "Дата выдачи",
      "Ученик",
      "Класс",
      "Предмет",
      "Учебник",
      "ISBN",
      "Статус",
      "Дата возврата",
      "Выдал(а)",
      "Компенсирована",
    ],
    data
  );

  return new NextResponse(body, {
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="journal-${Date.now()}.csv"`,
    },
  });
}
