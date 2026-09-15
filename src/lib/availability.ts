import { db } from "@/lib/prisma";

/** Доступность экземпляров учебника. */
export interface BookAvailability {
  /** Всего экземпляров в фонде (покупка/поступление). */
  total: number;
  /** Сейчас выдано (активные ISSUED-выдачи). */
  out: number;
  /** Списано: выдачи закрыты статусом LOST (книга утрачена, в башню не вернётся). */
  lost: number;
  /** Сколько ещё можно выдать: total − out − lost. */
  available: number;
}

/**
 * Арифметика остатка: `available = copies − выдано − списано`.
 * Экспортируется, чтобы запись выдачи (src/lib/loan-writes.ts) считала ровно
 * так же, как показывают списки: расхождение здесь выглядит как «в интерфейсе
 * было 0, а система всё равно выдала».
 */
export function availabilityOf(
  total: number,
  out: number,
  lost: number
): BookAvailability {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;
  const safeOut = Number.isFinite(out) && out > 0 ? out : 0;
  const safeLost = Number.isFinite(lost) && lost > 0 ? lost : 0;
  return {
    total: safeTotal,
    out: safeOut,
    lost: safeLost,
    available: Math.max(0, safeTotal - safeOut - safeLost),
  };
}

/** Доступность одной книги. */
export async function bookAvailability(
  bookId: string
): Promise<BookAvailability> {
  const map = await bookAvailabilityMap([bookId]);
  return map.get(bookId) ?? availabilityOf(1, 0, 0);
}

/** Доступность нескольких книг (одним запросом на выдачи). */
export async function bookAvailabilityMap(
  bookIds: string[]
): Promise<Map<string, BookAvailability>> {
  const ids = [...new Set(bookIds)];
  const result = new Map<string, BookAvailability>();
  if (ids.length === 0) return result;

  const [books, relevant] = await Promise.all([
    db.orm.public.Book.where((b) => b.id.in(ids)).all(),
    // ISSUED (выдано) и LOST (списано) — оба статуса уменьшают остаток.
    db.orm.public.Loan
      .where((l) => l.bookId.in(ids))
      .where((l) => l.status.in(["ISSUED", "LOST"]))
      .all(),
  ]);

  const outByBook = new Map<string, number>();
  const lostByBook = new Map<string, number>();
  for (const l of relevant) {
    if (l.status === "LOST") {
      lostByBook.set(l.bookId, (lostByBook.get(l.bookId) ?? 0) + 1);
    } else {
      outByBook.set(l.bookId, (outByBook.get(l.bookId) ?? 0) + 1);
    }
  }
  for (const b of books) {
    result.set(
      b.id,
      availabilityOf(b.copies, outByBook.get(b.id) ?? 0, lostByBook.get(b.id) ?? 0)
    );
  }
  // Книги, которых нет в каталоге (удалили в полёте) — не блокируем выдачу.
  for (const id of ids) {
    if (!result.has(id)) {
      result.set(
        id,
        availabilityOf(1, outByBook.get(id) ?? 0, lostByBook.get(id) ?? 0)
      );
    }
  }
  return result;
}
