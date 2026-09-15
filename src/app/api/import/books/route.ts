import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { db } from "@/lib/prisma";
import { gradeFromTitle } from "@/lib/book-grade";

/**
 * Массовый импорт учебников из CSV.
 * Тело: { csv: string, dryRun?: boolean }
 * Столбцы: ISBN; Название; Предмет; Класс (опц. — сразу привязать).
 * Дубликаты по ISBN пропускаются.
 */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  let body: { csv?: string; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидался JSON { csv }" }, { status: 400 });
  }

  const text = (body.csv ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) {
    return NextResponse.json({ error: "CSV пуст" }, { status: 400 });
  }
  const write = !body.dryRun;

  const rows = parseCsv(text);
  const firstLine = (rows[0] ?? []).join(" ").toLowerCase();
  const hasHeader =
    firstLine.includes("isbn") ||
    firstLine.includes("назван") ||
    firstLine.includes("предмет");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) {
    return NextResponse.json({ error: "В файле нет данных" }, { status: 400 });
  }

  const [books, classes, links] = await Promise.all([
    db.orm.public.Book.all(),
    db.orm.public.Class.all(),
    db.orm.public.ClassBook.all(),
  ]);

  const isbnSet = new Set(
    books.map((b) => (b.isbn as string).replace(/[-\s]/g, ""))
  );
  const linkSet = new Set(
    links.map((l) => `${l.classId}|${l.bookId}`)
  );
  const classByName = new Map(
    classes.map((c) => [c.name.trim().toLowerCase(), { id: c.id, name: c.name }])
  );
  const newClassIds = new Map<string, string | undefined>();

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let skipped = 0;
  let linksCreated = 0;
  let classesCreated = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNo = i + 1 + (hasHeader ? 1 : 0);
    const isbn = (row[0] ?? "").trim();
    const title = (row[1] ?? "").trim();
    const subject = (row[2] ?? "").trim();
    const className = (row[3] ?? "").trim();

    if (!isbn || !title || !subject) {
      errors.push({ row: rowNo, message: "Нужны ISBN, название и предмет" });
      continue;
    }

    const isbnNorm = isbn.replace(/[-\s]/g, "");
    if (isbnSet.has(isbnNorm)) {
      skipped++;
      continue;
    }
    isbnSet.add(isbnNorm);

    let bookId: string | undefined;
    if (write) {
      // Номер набора — из названия («Физика, 8 класс» → 8), иначе архив.
      const b = await db.orm.public.Book.create({ isbn, title, subject, grade: gradeFromTitle(title) });
      bookId = b.id;
    }
    created++;

    if (className) {
      const norm = className.toLowerCase();
      let cls = classByName.get(norm);
      if (!cls) {
        if (write && !newClassIds.has(norm)) {
          const c = await db.orm.public.Class.create({ name: className });
          newClassIds.set(norm, c.id);
          classByName.set(norm, { id: c.id, name: c.name });
          classesCreated++;
          cls = { id: c.id, name: c.name };
        } else if (!write) {
          if (!newClassIds.has(norm)) newClassIds.set(norm, undefined);
        }
      }
      if (cls && bookId && !linkSet.has(`${cls.id}|${bookId}`)) {
        if (write) {
          await db.orm.public.ClassBook.create({ classId: cls.id, bookId });
          linksCreated++;
        }
        linkSet.add(`${cls.id}|${bookId}`);
      }
    }
  }

  const newClasses = write ? classesCreated : [...newClassIds.values()].length;

  if (write && created > 0) {
    void logAudit("import.books", "import", guard.user, null, {
      created,
      skipped,
      newClasses,
      links: linksCreated,
      errors: errors.length,
    });
  }

  return NextResponse.json({
    dryRun: !write,
    total: dataRows.length,
    created,
    skipped,
    newClasses,
    links: linksCreated,
    errors,
  });
}
