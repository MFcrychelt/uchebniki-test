import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { staffUser } from "@/lib/auth";
import { CSV_HEADERS, csvContent, ruDate } from "@/lib/csv";
import { db } from "@/lib/prisma";

/**
 * Сводный отчёт в CSV (для школьного офиса). Те же фильтры, что и
 * GET /api/reports/summary. Плоская структура «Раздел;Позиция;…» —
 * удобно открывать в Excel.
 */
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromTs = from ? Temporal.Instant.from(`${from}T00:00:00Z`) : null;
  const toTs = to ? Temporal.Instant.from(`${to}T23:59:59Z`) : null;
  const inPeriod = (instant: Temporal.Instant | null): boolean => {
    if (!instant) return false;
    if (fromTs && Temporal.Instant.compare(instant, fromTs) < 0) return false;
    if (toTs && Temporal.Instant.compare(instant, toTs) > 0) return false;
    return true;
  };

  const [loans, requests] = await Promise.all([
    db.orm.public.Loan
      .include("student", (s) => s.include("class"))
      .include("book")
      .all(),
    db.orm.public.BookRequest.all(),
  ]);

  const periodLabel =
    from || to ? `за период ${ruDate(from ?? null)} — ${ruDate(to ?? null)}` : "за всё время";

  const totals = { issued: 0, returned: 0, lost: 0, compensated: 0, active: 0 };
  const debtors = new Set<string>();
  const subj = new Map<string, { issued: number; returned: number; lost: number }>();
  const cls = new Map<string, { issued: number; returned: number; lost: number }>();
  const books = new Map<string, { title: string; subject: string; issued: number }>();

  const bump = (
    m: Map<string, { issued: number; returned: number; lost: number }>,
    k: string,
    f: "issued" | "returned" | "lost"
  ) => {
    const e = m.get(k) ?? { issued: 0, returned: 0, lost: 0 };
    e[f]++;
    m.set(k, e);
  };

  for (const l of loans) {
    const book = l.book as { id: string; title: string; subject: string } | null;
    const student = l.student as {
      id: string;
      class: { name: string } | null;
    } | null;
    const subject = book?.subject ?? "—";
    const className = student?.class?.name ?? "Без класса";

    if (inPeriod(l.issuedAt as Temporal.Instant)) {
      totals.issued++;
      bump(subj, subject, "issued");
      bump(cls, className, "issued");
      if (book) {
        const b = books.get(book.id) ?? {
          title: book.title,
          subject: book.subject,
          issued: 0,
        };
        b.issued++;
        books.set(book.id, b);
      }
    }
    if (l.status === "RETURNED" && inPeriod(l.returnedAt as Temporal.Instant | null)) {
      totals.returned++;
      bump(subj, subject, "returned");
      bump(cls, className, "returned");
    }
    if (l.status === "LOST") {
      const lostAt = (l.lostAt as Temporal.Instant | null) ?? (l.issuedAt as Temporal.Instant);
      if (inPeriod(lostAt)) {
        totals.lost++;
        bump(subj, subject, "lost");
        bump(cls, className, "lost");
      }
    }
    if (inPeriod(l.compensatedAt as Temporal.Instant | null)) totals.compensated++;
    if (l.status === "ISSUED") {
      totals.active++;
      if (student) debtors.add(student.id);
    }
  }

  const reqCreated = requests.filter((r) => inPeriod(r.createdAt as Temporal.Instant)).length;
  const reqFulfilled = requests.filter(
    (r) => r.status === "ISSUED" && inPeriod(r.handledAt as Temporal.Instant | null)
  ).length;
  const reqDeclined = requests.filter(
    (r) => r.status === "DECLINED" && inPeriod(r.handledAt as Temporal.Instant | null)
  ).length;

  const splitRows = (
    m: Map<string, { issued: number; returned: number; lost: number }>
  ) =>
    [...m.entries()]
      .map(([name, v]) => [name, v.issued, v.returned, v.lost] as (string | number)[])
      .sort((a, b) => Number(b[1]) - Number(a[1]));

  const rows: (string | number)[][] = [
    ["Школьная библиотека", periodLabel],
    [],
    ["ИТОГИ ЗА ПЕРИОД", "", "", ""],
    ["Выдано", totals.issued, "", ""],
    ["Возвращено", totals.returned, "", ""],
    ["Утеряно", totals.lost, "", ""],
    ["Компенсировано", totals.compensated, "", ""],
    ["Сейчас выдано (снимок)", totals.active, "", ""],
    ["Учеников с долгами (снимок)", debtors.size, "", ""],
    ["Заявок создано", reqCreated, "", ""],
    ["Заявок выполнено", reqFulfilled, "", ""],
    ["Заявок отклонено", reqDeclined, "", ""],
    [],
    ["ПО ПРЕДМЕТАМ", "выдано", "возвращено", "утеряно"],
    ...splitRows(subj),
    [],
    ["ПО КЛАССАМ", "выдано", "возвращено", "утеряно"],
    ...splitRows(cls),
  ];

  if (books.size > 0) {
    rows.push([]);
    rows.push(["ТОП УЧЕБНИКОВ", "выдано", "", ""]);
    [...books.values()]
      .sort((a, z) => z.issued - a.issued || a.title.localeCompare(z.title, "ru"))
      .slice(0, 10)
      .forEach((b, i) => rows.push([`${i + 1}. ${b.title} (${b.subject})`, b.issued, "", ""]));
  }

  const body = csvContent(["Раздел", "Позиция", "Значение 1", "Значение 2"], rows);

  return new NextResponse(body, {
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="summary-${Date.now()}.csv"`,
    },
  });
}
