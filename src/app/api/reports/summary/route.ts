import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { staffUser } from "@/lib/auth";
import { db } from "@/lib/prisma";

/**
 * Сводный отчёт для директора: потоки за период (выдано / возвращено /
 * утеряно / компенсировано), разбивки по предметам и классам, топ
 * востребованных учебников, заявки, текущие долги (снимок).
 *
 * Фильтры: ?from=YYYY-MM-DD &to=YYYY-MM-DD (по датам событий:
 * выдача — issuedAt, возврат — returnedAt, утрата — lostAt,
 * компенсация — compensatedAt). Без фильтров — за всё время.
 * Снимки («сейчас выдано», «должников») периодом не ограничиваются.
 */
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const fromTs = fromParam
    ? Temporal.Instant.from(`${fromParam}T00:00:00Z`)
    : null;
  const toTs = toParam ? Temporal.Instant.from(`${toParam}T23:59:59Z`) : null;

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
    db.orm.public.BookRequest
      .include("book")
      .all(),
  ]);

  const totals = {
    issued: 0,
    returned: 0,
    lost: 0,
    compensated: 0,
    active: 0,
    debtors: 0,
  };
  const debtors = new Set<string>();

  const subjMap = new Map<string, { issued: number; returned: number; lost: number }>();
  const classMap = new Map<string, { issued: number; returned: number; lost: number }>();
  const bookMap = new Map<string, { title: string; subject: string; isbn: string; issued: number }>();

  const bump = (
    map: Map<string, { issued: number; returned: number; lost: number }>,
    key: string,
    field: "issued" | "returned" | "lost"
  ) => {
    const entry = map.get(key) ?? { issued: 0, returned: 0, lost: 0 };
    entry[field]++;
    map.set(key, entry);
  };

  for (const l of loans) {
    const book = l.book as { id: string; isbn: string; title: string; subject: string } | null;
    const student = l.student as {
      id: string;
      class: { id: string; name: string } | null;
    } | null;
    const subject = book?.subject ?? "—";
    const className = student?.class?.name ?? "Без класса";

    // Выдача (создание записи) за период.
    if (inPeriod(l.issuedAt as Temporal.Instant)) {
      totals.issued++;
      bump(subjMap, subject, "issued");
      bump(classMap, className, "issued");
      if (book) {
        const b = bookMap.get(book.id) ?? {
          title: book.title,
          subject: book.subject,
          isbn: book.isbn,
          issued: 0,
        };
        b.issued++;
        bookMap.set(book.id, b);
      }
    }

    // Возврат за период (по дате возврата).
    if (l.status === "RETURNED" && inPeriod(l.returnedAt as Temporal.Instant | null)) {
      totals.returned++;
      bump(subjMap, subject, "returned");
      bump(classMap, className, "returned");
    }

    // Утрата за период (по дате утери; старые записи — по дате выдачи).
    if (l.status === "LOST") {
      const lostAt = (l.lostAt as Temporal.Instant | null) ?? (l.issuedAt as Temporal.Instant);
      if (inPeriod(lostAt)) {
        totals.lost++;
        bump(subjMap, subject, "lost");
        bump(classMap, className, "lost");
      }
    }

    // Компенсация за период.
    if (inPeriod(l.compensatedAt as Temporal.Instant | null)) {
      totals.compensated++;
    }

    // Снимок: текущие долги.
    if (l.status === "ISSUED") {
      totals.active++;
      if (student) debtors.add(student.id);
    }
  }
  totals.debtors = debtors.size;

  const sortEntries = (
    map: Map<string, { issued: number; returned: number; lost: number }>
  ) =>
    [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort(
        (a, b) =>
          b.issued - a.issued || a.name.localeCompare(b.name, "ru")
      );

  const topBooks = [...bookMap.values()]
    .sort((a, b) => b.issued - a.issued || a.title.localeCompare(b.title, "ru"))
    .slice(0, 10);

  const reqTotals = { created: 0, fulfilled: 0, declined: 0 };
  for (const r of requests) {
    if (inPeriod(r.createdAt as Temporal.Instant)) reqTotals.created++;
    const handledAt = r.handledAt as Temporal.Instant | null;
    if (r.status === "ISSUED" && inPeriod(handledAt)) reqTotals.fulfilled++;
    if (r.status === "DECLINED" && inPeriod(handledAt)) reqTotals.declined++;
  }

  return NextResponse.json({
    period: { from: fromParam ?? null, to: toParam ?? null },
    totals,
    bySubject: sortEntries(subjMap),
    byClass: sortEntries(classMap),
    topBooks,
    requests: reqTotals,
  });
}
