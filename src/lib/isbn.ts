/**
 * ISBN: нормализация и пересчёт форм.
 *
 * Почему это отдельный модуль: сверка при выдаче, поиск дублей в каталоге и
 * инвентаризация по башням сравнивали строки каждая по-своему — кто-то после
 * снятия дефисов, кто-то как есть. Из-за этого учебник, заведённый с
 * дефисами («978-5-17-…», человек вводит с обложки), находилось сканом, а
 * вот издание со старой 10-значной записью на обложке — уже нет, и на пункте
 * выдачи это выглядело как «программа не видит книгу».
 *
 * Обложки советских и ранних российских переизданий до сих пор несут ISBN-10,
 * а штрихкод под ними — всегда EAN-13; один и тот же учебник в каталоге может
 * быть записан в любом из двух видов. Поэтому сравниваем не строки, а
 * множество допустимых форм одной книги (`isbnVariants`).
 */

/** Убирает разделители; оставляет цифры и возможную контрольную `X` в конце. */
export function normalizeIsbn(raw: string): string {
  return (raw ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function checksum13(body9: string): string {
  // Для EAN-13 контрольная считается по 12 первым цифрам (веса 1,3…).
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(body9[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function checksum10(body9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body9[i]) * (10 - i);
  const r = (11 - (sum % 11)) % 11;
  return r === 10 ? "X" : String(r);
}

/** ISBN-10 → ISBN-13 (только для 978-префикса; у 979 десятичной формы нет). */
export function isbn13From10(isbn10: string): string | null {
  const s = normalizeIsbn(isbn10);
  if (s.length !== 10 || !/^\d{9}[0-9X]$/.test(s)) return null;
  if (checksum10(s.slice(0, 9)) !== s[9]) return null; // не ISBN вовсе
  const body12 = "978" + s.slice(0, 9);
  return body12 + checksum13(body12);
}

/** ISBN-13 → ISBN-10 (обратимо только для 978-префикса). */
export function isbn10From13(isbn13: string): string | null {
  const s = normalizeIsbn(isbn13);
  if (s.length !== 13 || !/^\d{12}[0-9X]$/.test(s)) return null;
  if (checksum13(s.slice(0, 12)) !== s[12]) return null;
  if (!s.startsWith("978")) return null;
  const body9 = s.slice(3, 12);
  return body9 + checksum10(body9);
}

/**
 * Все формы, в которых эта книга может быть записана в каталоге:
 * нормализованная + 13-значная + 10-значная (если она существует).
 * Возвращаются только корректные по контрольной цифре варианты — иначе
 * опечатка в последней цифре начала «находить» другую книгу.
 */
export function isbnVariants(raw: string): string[] {
  const s = normalizeIsbn(raw);
  if (!s) return [];
  const out = new Set<string>([s]);
  const as13 = s.length === 10 ? isbn13From10(s) : null;
  if (as13) out.add(as13);
  const as10 = s.length === 13 ? isbn10From13(s) : null;
  if (as10) out.add(as10);
  return [...out];
}

/** Совпадают ли две записи про одну и ту же книгу. */
export function sameIsbn(a: string, b: string): boolean {
  const va = isbnVariants(a);
  const vb = isbnVariants(b);
  if (va.length === 0 || vb.length === 0) return false;
  const set = new Set(va);
  return vb.some((x) => set.has(x));
}
