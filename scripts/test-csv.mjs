// Тесты CSV-парсера. Запуск: node --experimental-strip-types scripts/test-csv.mjs
import { parseCsv } from "../src/lib/csv.ts";

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("parseCsv");
ok(eq(parseCsv("a;b\nc;d"), [["a", "b"], ["c", "d"]]), "простой ';'");
ok(eq(parseCsv("a,b\nc,d"), [["a", "b"], ["c", "d"]]), "простой ','");
ok(
  eq(parseCsv('"a;b";c\n"x";y'), [["a;b", "c"], ["x", "y"]]),
  "кавычки с разделителем внутри"
);
ok(
  eq(parseCsv('a;"b ""c""";d'), [["a", 'b "c"', "d"]]),
  "эскейп кавычек (\"\" → \")"
);
ok(eq(parseCsv("a;b\r\nc;d"), [["a", "b"], ["c", "d"]]), "CRLF");
ok(eq(parseCsv("\uFEFFa;b\nc;d"), [["a", "b"], ["c", "d"]]), "BOM");
ok(eq(parseCsv("a;b\n\n\nc;d"), [["a", "b"], ["c", "d"]]), "пустые строки отбрасываются");
ok(eq(parseCsv("  a ; b \nc;d"), [["a", "b"], ["c", "d"]]), "trim ячеек");
ok(eq(parseCsv("a;b;c"), [["a", "b", "c"]]), "разное число колонок ок");
ok(eq(parseCsv('"";b'), [["", "b"]]), "пустая кавычная ячейка");
ok(
  eq(parseCsv("Фамилия;Имя;Класс\nИванов;Иван;8-А"), [
    ["Фамилия", "Имя", "Класс"],
    ["Иванов", "Иван", "8-А"],
  ]),
  "кириллица"
);
ok(
  eq(parseCsv('978-5377-058562;"Математика, 8 класс";Математика;8-А'), [
    ["978-5377-058562", "Математика, 8 класс", "Математика", "8-А"],
  ]),
  "ISBN + название с запятой в кавычках (комма-разделитель)"
);

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
