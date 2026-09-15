import Link from "next/link";
import { db } from "@/lib/prisma";
import PrintToolbar from "../toolbar";
import "../print.css";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Печатный список учебников класса: /print/class-list?classId=…
export default async function PrintClassListPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  // Эти листы формируются прямым запросом к БД в серверном компоненте, без
  // API-слоя — значит проверка сессии нужна здесь, иначе список класса,
  // этикетки фонда, акт или журнал печатает любой, кто знает адрес.
  await requireStaff("/print/class-list");

  const { classId } = await searchParams;

  const cls = classId
    ? await db.orm.public.Class
        .where({ id: classId })
        .include("students", (s) => s.count())
        .include("books", (b) => b.include("book"))
        .first()
    : null;

  const books = (cls?.books ?? [])
    .map((cb) => cb.book as { id: string; title: string; subject: string; isbn: string })
    .sort((a, b) => a.subject.localeCompare(b.subject, "ru") || a.title.localeCompare(b.title, "ru"));

  return (
    <main className="print-page">
      <PrintToolbar backHref="/admin" />

      {!cls ? (
        <p>
          Класс не найден.{" "}
          <Link href="/admin" className="text-primary underline">
            К администратору
          </Link>
        </p>
      ) : (
        <>
          <h1>Список учебников — {cls.name}</h1>
          <p className="print-subtitle">
            {books.length} учебников · {cls.students} учеников ·{" "}
            {new Date().toLocaleDateString("ru-RU")}
          </p>

          <table className="print-table">
            <thead>
              <tr>
                <th className="num">№</th>
                <th>Предмет</th>
                <th>Учебник</th>
                <th>ISBN</th>
                <th className="sign">Отметка</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b, i) => (
                <tr key={b.id}>
                  <td className="num">{i + 1}</td>
                  <td>{b.subject}</td>
                  <td>{b.title}</td>
                  <td>{b.isbn}</td>
                  <td className="sign">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="print-subtitle mt-6 text-xs">
            Подпись: ____________________ / Библиотекарь: ____________________
          </p>
        </>
      )}
    </main>
  );
}
