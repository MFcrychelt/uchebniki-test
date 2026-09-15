// Разнести учебники по наборам сезона (grade 1–11) после миграции
// active → grade. Запускать один раз: node scripts/backfill-book-grade.mjs --apply
// Без --apply — сухой прогон (показать план без записи).
//
// Откуда берём номер набора:
//  1. из названия учебника: «Математика, 8 класс» → 8;
//  2. иначе из номеров привязанных классов: «8-А» → 8;
//  3. иначе NULL — книга остаётся вне наборов (архив).
// Скрипт меняет только книги с grade IS NULL, но после ручной разборки
// архива повторный запуск вернёт книги в наборы — поэтому и --apply.
import "dotenv/config";
import { Temporal } from "@js-temporal/polyfill";
if (!globalThis.Temporal) globalThis.Temporal = Temporal; // Prisma 8 требует Temporal
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../prisma/schema.json" with { type: "json" };

const db = postgres({
  contract: contractJson,
  url: process.env.DATABASE_URL,
});

const gradeFromTitle = (title) => {
  const m = /(\d{1,2})\s*[-–—]?\s*класс/i.exec(title ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 11 ? n : null;
};

const gradeFromClassName = (name) => {
  const m = /^\s*(\d{1,2})/.exec(name ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 11 ? n : null;
};

const books = await db.orm.public.Book.all();
const links = await db.orm.public.ClassBook
  .include("class")
  .all();

const byBook = new Map();
for (const l of links) {
  const list = byBook.get(l.bookId) ?? [];
  list.push(l.class?.name ?? "");
  byBook.set(l.bookId, list);
}

const plan = [];
for (const b of books) {
  if (b.grade != null) continue; // уже распределён
  let grade = gradeFromTitle(b.title);
  let how = grade != null ? "название" : null;
  if (grade == null) {
    const grades = (byBook.get(b.id) ?? [])
      .map(gradeFromClassName)
      .filter((g) => g != null);
    if (grades.length) {
      grade = grades[0];
      how = `классы: ${[...new Set(grades)].join(", ")}`;
    }
  }
  plan.push({ book: b, grade, how });
}

if (!plan.length) {
  console.log("Все учебники уже распределены по наборам — делать нечего.");
} else {
  for (const { book, grade, how } of plan) {
    console.log(
      `${grade == null ? "архив " : `${grade} кл.`} ← «${book.title}»` +
        (how ? `  (${how})` : "")
    );
  }
}

if (process.argv.includes("--apply")) {
  for (const { book, grade } of plan) {
    await db.orm.public.Book
      .where({ id: book.id })
      .update({ grade });
  }
  console.log(`\nОбновлено книг: ${plan.length}.`);
} else {
  console.log("\nСухой прогон: добавьте --apply, чтобы записать.");
}
process.exit(0);
