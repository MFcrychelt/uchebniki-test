// Тесты нормализации и пересчёта ISBN. Запуск:
//   node --experimental-strip-types scripts/test-isbn.mjs
//
// Проверяется ровно то, из-за чего на пункте выдачи появляется «скан не
// видит книгу»: обложка несёт ISBN-10, штрихкод под ней — EAN-13, и в
// каталоге книга может быть записана в любом из этих видов.
import {
  isbn10From13,
  isbn13From10,
  isbnVariants,
  normalizeIsbn,
  sameIsbn,
} from "../src/lib/isbn.ts";

let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗", name);
  }
};

console.log("1. Нормализация: то, что человек вводит с обложки");
{
  ok(normalizeIsbn("978-5-17-090280-6") === "9785170902806", "дефисы убираются");
  ok(normalizeIsbn(" 978 5 17 090280 6 ") === "9785170902806", "пробелы убираются");
  ok(normalizeIsbn("9785170902806") === "9785170902806", "чистый штрихкод не меняется");
  ok(normalizeIsbn("030640615x") === "030640615X", "контрольная X в верхний регистр");
  ok(normalizeIsbn("нет цифр") === "", "мусор → пустая строка");
}

console.log("2. ISBN-10 ⇄ ISBN-13 (эталонная пара)");
{
  const TEN = "0306406152";
  const THIRTEEN = "9780306406157";
  ok(isbn13From10(TEN) === THIRTEEN, `${TEN} → ${THIRTEEN}`);
  ok(isbn10From13(THIRTEEN) === TEN, "обратный пересчёт даёт то же ISBN-10");
  ok(sameIsbn(TEN, THIRTEEN), "формы считаются одной книгой");
  ok(sameIsbn("0-306-40615-2", THIRTEEN), "с дефисами — тоже одна книга");
}

console.log("3. Контрольная цифра важна");
{
  ok(isbn13From10("0306406153") === null, "битый ISBN-10 не превращаем в «правильный»");
  ok(isbn10From13("9780306406158") === null, "битый EAN-13 не пересчитываем");
  // Одна цифра отличается — это ДРУГАЯ книга, и находить её не нужно.
  ok(!sameIsbn("0306406152", "9780306406158"), "похожий, но другой код не совпадает");
}

console.log("4. 979-префикс: десятичной формы не существует");
{
  const s = "9791090636071";
  ok(isbn10From13(s) === null, "979… → null (не выдумываем ISBN-10)");
  ok(isbnVariants(s).length === 1, "вариант один — сама 13-значная запись");
  ok(sameIsbn(s, s), "сама с собой совпадает");
}

console.log("5. Не-книжные и короткие коды не ломают сверку");
{
  ok(isbnVariants("").length === 0, "пустая строка → пустой список");
  ok(!sameIsbn("", ""), "пустые не считаются совпадением");
  ok(!sameIsbn("123", "1234"), "произвольные цифры не «находят» друг друга");
  ok(isbnVariants("abc9780306406157def").includes("0306406152"), "текст вокруг кода не мешает");
}

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
