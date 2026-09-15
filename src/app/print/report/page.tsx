import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import PrintToolbar from "../toolbar";
import "../print.css";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const dateFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";

function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

interface Split {
  name: string;
  issued: number;
  returned: number;
  lost: number;
}

// Отчёт о работе библиотеки за период: /print/report?from=&to=
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Эти листы формируются прямым запросом к БД в серверном компоненте, без
  // API-слоя — значит проверка сессии нужна здесь, иначе список класса,
  // этикетки фонда, акт или журнал печатает любой, кто знает адрес.
  await requireStaff("/print/report");


  const { from, to } = await searchParams;
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

  const totals = { issued: 0, returned: 0, lost: 0, compensated: 0, active: 0 };
  const debtors = new Set<string>();
  const subj = new Map<string, Split>();
  const cls = new Map<string, Split>();
  const books = new Map<string, { title: string; subject: string; issued: number }>();

  const bump = (m: Map<string, Split>, k: string, f: keyof Omit<Split, "name">) => {
    const e = m.get(k) ?? { name: k, issued: 0, returned: 0, lost: 0 };
    e[f] = (e[f] as number) + 1;
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

  const sortSplits = (m: Map<string, Split>) =>
    [...m.values()].sort(
      (a, b) => b.issued - a.issued || a.name.localeCompare(b.name, "ru")
    );
  const topBooks = [...books.values()]
    .sort((a, b) => b.issued - a.issued || a.title.localeCompare(b.title, "ru"))
    .slice(0, 10);

  const periodLabel =
    from || to
      ? `с ${dateFmt(from ?? null)} по ${dateFmt(to ?? null)}`
      : "за всё время";

  return (
    <main className="print-page">
      <PrintToolbar backHref="/librarian" />

      <h1>Отчёт о работе школьной библиотеки</h1>
      <p className="print-subtitle">
        за период: {periodLabel} · составлен {dateFmt(new Date().toISOString())}
      </p>

      <h3 className="mt-4 mb-1 text-base font-semibold">1. Итоги за период</h3>
      <table className="print-table">
        <tbody>
          <tr>
            <td>Выдано учебников</td>
            <td className="num">{totals.issued}</td>
          </tr>
          <tr>
            <td>Возвращено</td>
            <td className="num">{totals.returned}</td>
          </tr>
          <tr>
            <td>Утеряно</td>
            <td className="num">{totals.lost}</td>
          </tr>
          <tr>
            <td>Компенсировано</td>
            <td className="num">{totals.compensated}</td>
          </tr>
          <tr>
            <td>Заявок учеников: создано / выполнено / отклонено</td>
            <td className="num">
              {reqCreated} / {reqFulfilled} / {reqDeclined}
            </td>
          </tr>
          <tr>
            <td>
              Сейчас выдано (снимок) /{" "}
              {pluralRu(debtors.size, "ученик с долгом", "ученика с долгами", "учеников с долгами")}{" "}
              (снимок)
            </td>
            <td className="num">
              {totals.active} / {debtors.size}
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-5 mb-1 text-base font-semibold">2. По предметам</h3>
      <table className="print-table">
        <thead>
          <tr>
            <th>Предмет</th>
            <th className="num">Выдано</th>
            <th className="num">Возвращено</th>
            <th className="num">Утеряно</th>
          </tr>
        </thead>
        <tbody>
          {sortSplits(subj).map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.issued}</td>
              <td className="num">{r.returned}</td>
              <td className="num">{r.lost}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-5 mb-1 text-base font-semibold">3. По классам</h3>
      <table className="print-table">
        <thead>
          <tr>
            <th>Класс</th>
            <th className="num">Выдано</th>
            <th className="num">Возвращено</th>
            <th className="num">Утеряно</th>
          </tr>
        </thead>
        <tbody>
          {sortSplits(cls).map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.issued}</td>
              <td className="num">{r.returned}</td>
              <td className="num">{r.lost}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {topBooks.length > 0 && (
        <>
          <h3 className="mt-5 mb-1 text-base font-semibold">
            4. Самые востребованные учебники
          </h3>
          <table className="print-table">
            <thead>
              <tr>
                <th className="num">№</th>
                <th>Учебник</th>
                <th>Предмет</th>
                <th className="num">Выдано</th>
              </tr>
            </thead>
            <tbody>
              {topBooks.map((b, i) => (
                <tr key={b.title}>
                  <td className="num">{i + 1}</td>
                  <td>{b.title}</td>
                  <td>{b.subject}</td>
                  <td className="num">{b.issued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          Составил(а) (библиотекарь):
          <div className="mt-10 border-b border-dashed border-#444" />
          <div className="mt-1 text-xs text-#555">должность / подпись / Ф.И.О.</div>
        </div>
        <div>
          Согласовал(а) (заведующий):
          <div className="mt-10 border-b border-dashed border-#444" />
          <div className="mt-1 text-xs text-#555">должность / подпись / Ф.И.О.</div>
        </div>
      </div>

      <p className="mt-8 text-xs text-#555">
        Период ограничен датами операций: выдача — датой выдачи, возврат —
        датой возврата, утрата — датой списания, компенсация — датой отметки.
        Снимки («сейчас выдано», «ученики с долгами») — на дату составления
        отчёта.
      </p>
    </main>
  );
}
