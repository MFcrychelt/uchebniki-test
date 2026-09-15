import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { availabilityOf } from "@/lib/availability";

/**
 * Записи по выдачам — атомарно и без гонки за «последний экземпляр».
 *
 * Проблема, из-за которой появился этот модуль: `POST /api/loans` был
 * «проверил → записал» без всякой защиты. Два тапа, две вкладки, офлайн-
 * очередь второго устройства и «выдать всё» на класс — и оба поток
 * проходили проверку `available > 0`, а в журнале появлялись две выдачи на
 * один физический экземпляр (остаток уходил в минус, и «исправить» его было
 * нечем).
 *
 * Что здесь:
 *  1. `db.transaction(...)` — проверка и запись в одной транзакции, так что
 *     часть работы не остаётся committed, если дальше пошёл throw (актуально
 *     для пачки: либо весь класс выдан, либо ничего).
 *  2. Мьютекс на книгу в пределах процесса (`withLoanWriteLock`) — пока
 *     сервер один (а школьный сервер и есть один процесс), этого довольно,
 *     чтобы две параллельные выдачи одной книги не переплелись. Ключи
 *     берём по sorted-порядку: иначе пачка из двух книг и встречная пачка
 *     загнали бы друг друга в тупик.
 *
 * Честная граница: мьютекс живёт в памяти процесса. Если приложение когда-
 * нибудь запустят в двух копиях за балансировщиком, понадобится уровень БД
 * — уникальный частичный индекс на (student_id, book_id) WHERE status =
 * 'ISSUED' (от дублей) и блокировка строки книги (`SELECT … FOR UPDATE`)
 * для тиража. В текущей сборке Prisma 8 (`@prisma/orm-postgres`) блокировок
 * в ORM нет, `raw` внутри транзакции недоступен — поэтому и выбран путь
 * «одна запись = одна транзакция под процессным мьютексом», а не видимость
 * защиты, которой нет.
 */

type Releaser = () => void;

/** Хвост очереди на каждый ключ: кто последний ждёт — тот и владеет замком. */
const tails = new Map<string, Promise<void>>();

async function acquire(key: string): Promise<Releaser> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((done) => {
    release = done;
  });
  tails.set(key, mine);
  await prev;
  return () => {
    release();
    // Снимаем метку, только если мы были последними в очереди: иначе
    // Map разрастётся на каждую когда-либо выданную книгу.
    if (tails.get(key) === mine) tails.delete(key);
  };
}

/**
 * Выполнить `fn`, владея блокировками по списку книг.
 * @param bookIds книги, к которым идёт запись (дубликаты схлопываются).
 */
export async function withLoanWriteLock<T>(
  bookIds: (string | null | undefined)[],
  fn: () => Promise<T>
): Promise<T> {
  const keys = [...new Set(bookIds.filter((x): x is string => !!x))].sort();
  const released: Releaser[] = [];
  try {
    for (const k of keys) released.push(await acquire(`loan:book:${k}`));
    return await fn();
  } finally {
    for (const done of released.reverse()) done();
  }
}

/** Итог попытки выдать: либо выдача, либо отказ с машинным кодом. */
export type IssueOutcome =
  | { ok: true; loan: Record<string, unknown> }
  | {
      ok: false;
      code: "already_issued" | "no_stock" | "not_in_set";
      error: string;
    };

/**
 * Выдать книгу: проверка дубля, набора сезона и остатка + запись — в одной
 * транзакции под блокировкой книги.
 */
export async function issueLoan(params: {
  studentId: string;
  bookId: string;
  librarianId: string | null;
}): Promise<IssueOutcome> {
  const { studentId, bookId, librarianId } = params;

  return withLoanWriteLock([bookId], async () =>
    db.transaction(async (tx) => {
      const existing = await tx.orm.public.Loan.where((l) =>
        l.studentId.eq(studentId)
      )
        .where((l) => l.bookId.eq(bookId))
        .where((l) => l.status.eq("ISSUED"))
        .first();
      if (existing) {
        return {
          ok: false as const,
          code: "already_issued" as const,
          error: "Книга уже выдана",
        };
      }

      const book = await tx.orm.public.Book.where({ id: bookId }).first();
      if (!book) {
        // Раньше этот случай уходил дальше и падал на FK (500). Учебника
        // нет — значит выдавать нечего.
        return {
          ok: false as const,
          code: "not_in_set" as const,
          error: "Учебник не найден в каталоге",
        };
      }
      if (book.grade == null) {
        return {
          ok: false as const,
          code: "not_in_set" as const,
          error: `«${book.title}» не в наборе этого года`,
        };
      }

      // Остаток — те же ISSUED + LOST и та же арифметика, что в списках
      // (availabilityOf), но посчитанные внутри транзакции: снимок «до
      // блокировки» устарел бы ровно в тот момент, когда он нужен меньше всего.
      const held = await tx.orm.public.Loan.where((l) => l.bookId.eq(bookId))
        .where((l) => l.status.in(["ISSUED", "LOST"]))
        .select("id", "status")
        .all();
      let out = 0;
      let lost = 0;
      for (const l of held) {
        if (l.status === "LOST") lost++;
        else out++;
      }
      const avail = availabilityOf(book.copies, out, lost);
      if (avail.available <= 0) {
        return {
          ok: false as const,
          code: "no_stock" as const,
          error: `Все экземпляры книги выданы (${avail.total} шт.)`,
        };
      }

      const loan = await tx.orm.public.Loan.create({
        studentId,
        bookId,
        librarianId,
        status: "ISSUED",
      });
      return { ok: true as const, loan: loan as unknown as Record<string, unknown> };
    })
  );
}

export type CloseOutcome =
  | { ok: true; loan: Record<string, unknown> }
  | { ok: false; code: "not_found" | "already_closed"; error: string };

/**
 * Закрыть выдачу (возврат или «утеряна») — тоже под блокировкой книги:
 * именно закрытие освобождает экземпляр, и параллельная выдача обязана
 * увидеть это целиком, а не наполовину.
 */
export async function closeLoan(params: {
  loanId: string;
  status: "RETURNED" | "LOST";
}): Promise<CloseOutcome> {
  const { loanId, status } = params;

  // Книга нужна, чтобы взять правильный замок — читаем до транзакции.
  const hint = await db.orm.public.Loan.where({ id: loanId }).first();
  if (!hint) {
    return {
      ok: false,
      code: "not_found",
      error: "Выдача не найдена или уже закрыта",
    };
  }

  return withLoanWriteLock([hint.bookId], async () =>
    db.transaction(async (tx) => {
      const current = await tx.orm.public.Loan.where({ id: loanId }).first();
      if (!current) {
        return {
          ok: false as const,
          code: "not_found" as const,
          error: "Выдача не найдена",
        };
      }
      if (current.status !== "ISSUED") {
        return {
          ok: false as const,
          code: "already_closed" as const,
          error:
            status === "RETURNED"
              ? "Книга уже закрыта (возвращена или утеряна)"
              : "Выдача уже закрыта",
        };
      }

      const patch =
        status === "RETURNED"
          ? { status: "RETURNED" as const, returnedAt: Temporal.Now.instant() }
          : { status: "LOST" as const, lostAt: Temporal.Now.instant() };
      const loan = await tx.orm.public.Loan.where({ id: loanId }).update(patch);
      return { ok: true as const, loan: loan as unknown as Record<string, unknown> };
    })
  );
}
