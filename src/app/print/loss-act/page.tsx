import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import PrintToolbar from "../toolbar";
import "../print.css";

export const dynamic = "force-dynamic";

const dateFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";

// Русская плюрализация: 1 учебник, 2 учебника, 5 учебников.
function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Акт списания (утери) учебников: /print/loss-act?from=&to=
// Печатный документ по всем LOST-выдачам за период (по дате утери,
// при её отсутствии — по дате выдачи).
export default async function PrintLossActPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;

  const loans = await db.orm.public.Loan
    .where((l) => l.status.eq("LOST"))
    .include("student", (s) => s.include("class"))
    .include("book")
    .include("compensatedBy")
    .all();

  // Отфильтровать по периоду «даты утери» (lostAt, иначе issuedAt).
  const fromTs = from ? Temporal.Instant.from(`${from}T00:00:00Z`) : null;
  const toTs = to ? Temporal.Instant.from(`${to}T23:59:59Z`) : null;

  const rows = loans
    .map((l) => {
      const student = l.student as {
        lastName: string;
        firstName: string;
        class: { name: string } | null;
      } | null;
      const book = l.book as { title: string; subject: string; isbn: string } | null;
      const compensatedBy = l.compensatedBy as {
        lastName: string;
        firstName: string;
      } | null;
      const lossInstant: Temporal.Instant | null = l.lostAt
        ? (l.lostAt as Temporal.Instant)
        : (l.issuedAt as Temporal.Instant);
      return {
        id: l.id,
        student,
        book,
        lossInstant,
        compensatedAt: l.compensatedAt as Temporal.Instant | null,
        compensatedBy: compensatedBy
          ? `${compensatedBy.lastName} ${compensatedBy.firstName}`
          : null,
      };
    })
    .filter((r) => {
      if (!r.lossInstant) return true;
      if (fromTs && Temporal.Instant.compare(r.lossInstant, fromTs) < 0) return false;
      if (toTs && Temporal.Instant.compare(r.lossInstant, toTs) > 0) return false;
      return true;
    })
    .sort((a, b) => (b.lossInstant ?? "").toString().localeCompare((a.lossInstant ?? "").toString()));

  const compensatedCount = rows.filter((r) => r.compensatedAt).length;

  const periodLabel =
    from || to
      ? `за период ${from ? dateFmt(new Date(from).toISOString()) : "…"} — ${
          to ? dateFmt(new Date(to).toISOString()) : "…"
        }`
      : "за всё время";

  return (
    <main className="print-page">
      <PrintToolbar backHref="/librarian" />

      {rows.length === 0 ? (
        <p>
          Нет утерянных учебников
          {from || to ? " за указанный период" : ""}.{" "}
          <Link href="/librarian" className="text-primary underline">
            В панель библиотекаря
          </Link>
        </p>
      ) : (
        <>
          <h1>Акт списания (утери) учебников</h1>
          <p className="print-subtitle">
            Школьная библиотека · {rows.length}{" "}
            {pluralRu(rows.length, "утерянный учебник", "утерянных учебника", "утерянных учебников")}
            {compensatedCount > 0 && ` · компенсировано: ${compensatedCount}`} ·{" "}
            {periodLabel} · составлен {dateFmt(new Date().toISOString())}
          </p>

          <table className="print-table">
            <thead>
              <tr>
                <th className="num">№</th>
                <th>Ученик</th>
                <th>Класс</th>
                <th>Предмет</th>
                <th>Учебник</th>
                <th>ISBN</th>
                <th>Дата утери</th>
                <th>Компенсация</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    {r.student
                      ? `${r.student.lastName} ${r.student.firstName}`
                      : "—"}
                  </td>
                  <td>{r.student?.class?.name ?? "—"}</td>
                  <td>{r.book?.subject ?? "—"}</td>
                  <td>{r.book?.title ?? "—"}</td>
                  <td className="num">{r.book?.isbn ?? "—"}</td>
                  <td>{dateFmt(r.lossInstant?.toString() ?? null)}</td>
                  <td>
                    {r.compensatedAt
                      ? `${dateFmt(r.compensatedAt.toString())}
                       ${r.compensatedBy ? `(${r.compensatedBy})` : ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
            Акт составлен по данным журнала выдачи. Компенсация — отметка о том,
            что утраченная книга возмещена (выдана замена или произведена
            покупка) и долг закрыт.
          </p>
        </>
      )}
    </main>
  );
}
