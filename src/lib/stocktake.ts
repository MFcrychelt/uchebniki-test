// Инвентаризация (переучёт): чистое ядро — сравнение отсканированных ISBN
// с каталогом (с тиражами) и активными выдачами. Без Prisma/React: покрыто
// юнит-тестами (scripts/test-stocktake.mjs, npm run test:stocktake).
//
// Сценарий: библиотекарь сканирует книги, лежащие в «башнях».
// У каждой книги может быть несколько физических экземпляров (book.copies).
// Пусть out — число активных выдач, lost — число списанных (LOST) копий.
// Тогда:
//   inLibrary = max(0, copies − out − lost) — копий ДОЛЖНО быть в башнях;
//   scanned   — сколько раз ISBN отсканировали.
// Отчёт находит расхождения учёта и физической реальности:
//   - missingFromTowers — в библиотеке должно быть N копий, нашли меньше;
//   - scannedButIssued  — «выданных» книг нашлись в башне (возврат не
//     зарегистрирован): последние (scanned − inLibrary) выдачи;
//   - overCatalog       — отсканировали больше копий, чем заявлено в
//     каталоге (вероятно, каталог устарел);
//   - issuedNotFound    — справка: книги, выданные и не найденные в башне
//     вовсе (нормальное состояние — проверка «все ли с местами»);
//   - unknown           — отсканирована, но ISBN нет в каталоге.

/** Нормализация ISBN: убирает дефисы и пробелы (EAN-13 даёт чистые цифры). */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").trim();
}

export interface StocktakeBook {
  bookId: string;
  isbn: string;
  title: string;
  subject: string;
  /** Сколько физических экземпляров в фонде. */
  copies: number;
  /** Сколько экземпляров списано (LOST-выдачи) — в башню не вернутся. */
  lost?: number;
  /** Названия классов, к которым книга привязана. */
  classNames: string[];
}

export interface StocktakeLoan {
  loanId: string;
  /** ISBN книги (как в каталоге; сравнение через normalizeIsbn). */
  isbn: string;
  title: string;
  /** «Фамилия Имя». */
  student: string;
  className: string | null;
  /** ISO-время выдачи (для отображения и сортировки «последние сверху»). */
  issuedAt: string;
}

export interface StocktakeInput {
  /** Сырые отсканированные значения (повторы разрешены — каждая копия). */
  scanned: string[];
  /** Ограничить переучёт книгами, привязанными к классу (иначе — вся библиотека). */
  classId?: string | null;
  className?: string;
  catalog: StocktakeBook[];
  /** Только активные (ISSUED) выдачи. */
  issuedLoans: StocktakeLoan[];
}

export interface UnknownIsbn {
  isbn: string;
  /** Сколько раз отсканирована. */
  count: number;
}

export interface MissingBook {
  bookId: string;
  isbn: string;
  title: string;
  subject: string;
  classNames: string[];
  /** Сколько копий не найдено (inLibrary − scanned). */
  missing: number;
  /** Сколько копий вообще должно было быть в башне. */
  expected: number;
}

export interface ReportLoan {
  loanId: string;
  isbn: string;
  title: string;
  student: string;
  className: string | null;
  issuedAt: string;
}

export interface OverCatalogBook {
  isbn: string;
  title: string;
  /** Сколько раз отсканировали. */
  scanned: number;
  /** Сколько копий заявлено в каталоге. */
  total: number;
}

export interface StocktakeReport {
  /** Уникальных ISBN в сканах. */
  scanned: number;
  /** Повторные сканы (общее число сканов − уникальных); с тиражами — норма. */
  duplicates: number;
  missingFromTowers: MissingBook[];
  scannedButIssued: ReportLoan[];
  issuedNotFound: ReportLoan[];
  overCatalog: OverCatalogBook[];
  unknown: UnknownIsbn[];
}

export function buildStocktakeReport(input: StocktakeInput): StocktakeReport {
  const scannedSet = new Set<string>();
  const scanCounts = new Map<string, number>();
  for (const raw of input.scanned) {
    const n = normalizeIsbn(raw);
    if (!n) continue;
    scannedSet.add(n);
    scanCounts.set(n, (scanCounts.get(n) ?? 0) + 1);
  }
  const totalScans = input.scanned.filter((s) => normalizeIsbn(s)).length;

  // Каталог (нормализованный ISBN → книга).
  const catalogByIsbn = new Map<string, StocktakeBook>();
  for (const b of input.catalog) catalogByIsbn.set(normalizeIsbn(b.isbn), b);

  // Охват: при фильтре по классу — только книги, привязанные к нему.
  const inScope = (b: StocktakeBook): boolean =>
    !input.classId || b.classNames.includes(input.className ?? "");

  // Выдачи: только по книгам в охвате.
  const loansByIsbn = new Map<string, StocktakeLoan[]>();
  for (const l of input.issuedLoans) {
    const book = catalogByIsbn.get(normalizeIsbn(l.isbn));
    if (!book || !inScope(book)) continue;
    const n = normalizeIsbn(l.isbn);
    const arr = loansByIsbn.get(n) ?? [];
    arr.push(l);
    loansByIsbn.set(n, arr);
  }

  const missingFromTowers: MissingBook[] = [];
  const scannedButIssued: ReportLoan[] = [];
  const issuedNotFound: ReportLoan[] = [];
  const overCatalog: OverCatalogBook[] = [];

  for (const book of input.catalog) {
    if (!inScope(book)) continue;
    const n = normalizeIsbn(book.isbn);
    const loans = loansByIsbn.get(n) ?? [];
    const out = loans.length;
    const lost = Math.max(0, book.lost ?? 0);
    const total = book.copies > 0 ? book.copies : 1;
    const inLibrary = Math.max(0, total - out - lost);
    const scanned = scanCounts.get(n) ?? 0;

    // В башне должно быть inLibrary копий; нашли меньше — недостаёт.
    if (scanned < inLibrary) {
      missingFromTowers.push({
        bookId: book.bookId,
        isbn: book.isbn,
        title: book.title,
        subject: book.subject,
        classNames: book.classNames,
        missing: inLibrary - scanned,
        expected: inLibrary,
      });
    }

    // В башне копий БОЛЬШЕ, чем должны: «выданные» нашлись — возврат не
    // зарегистрирован. Показываем последние N активных выдач этой книги.
    if (scanned > inLibrary) {
      const extra = Math.min(scanned - inLibrary, out);
      const recent = [...loans]
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        .slice(0, extra);
      for (const l of recent) {
        scannedButIssued.push({
          loanId: l.loanId,
          isbn: l.isbn,
          title: l.title,
          student: l.student,
          className: l.className,
          issuedAt: l.issuedAt,
        });
      }
    }

    // Сканов больше, чем всего экземпляров — каталог не учитывает копии.
    if (scanned > total) {
      overCatalog.push({
        isbn: book.isbn,
        title: book.title,
        scanned,
        total,
      });
    }

    // Справка: выданные и вовсе не найденные в башне (копии у учеников).
    if (scanned === 0 && out > 0) {
      for (const l of loans) {
        issuedNotFound.push({
          loanId: l.loanId,
          isbn: l.isbn,
          title: l.title,
          student: l.student,
          className: l.className,
          issuedAt: l.issuedAt,
        });
      }
    }
  }

  // Отсканированные, но не в каталоге.
  const unknown: UnknownIsbn[] = [];
  for (const [n, count] of scanCounts) {
    if (!catalogByIsbn.has(n)) unknown.push({ isbn: n, count });
  }

  const sortLoan = (a: ReportLoan, b: ReportLoan) =>
    a.title.localeCompare(b.title, "ru") || a.student.localeCompare(b.student, "ru");
  const sortBook = (a: MissingBook, b: MissingBook) =>
    a.title.localeCompare(b.title, "ru");
  const sortOver = (a: OverCatalogBook, b: OverCatalogBook) =>
    a.isbn.localeCompare(b.isbn);
  const sortUnknown = (a: UnknownIsbn, b: UnknownIsbn) =>
    a.isbn.localeCompare(b.isbn);

  return {
    scanned: scannedSet.size,
    duplicates: totalScans - scannedSet.size,
    missingFromTowers: missingFromTowers.sort(sortBook),
    scannedButIssued: scannedButIssued.sort(sortLoan),
    issuedNotFound: issuedNotFound.sort(sortLoan),
    overCatalog: overCatalog.sort(sortOver),
    unknown: unknown.sort(sortUnknown),
  };
}
