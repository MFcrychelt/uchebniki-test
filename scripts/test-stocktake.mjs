#!/usr/bin/env node
// Юнит-тесты ядра инвентаризации (src/lib/stocktake.ts).
// Запуск: npm run test:stocktake
import assert from "node:assert/strict";
import {
  buildStocktakeReport,
  normalizeIsbn,
} from "../src/lib/stocktake.ts";

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message.split("\n")[0]}`);
  }
};

console.log("normalizeIsbn");
test("убирает дефисы", () => {
  assert.equal(normalizeIsbn("978-5377-058562"), "9785377058562");
});
test("убирает пробелы", () => {
  assert.equal(normalizeIsbn("978 5377 058562"), "9785377058562");
});
test("чистые цифры не меняет", () => {
  assert.equal(normalizeIsbn("9785377058562"), "9785377058562");
});

console.log("buildStocktakeReport");

const cat = (over = {}) => ({
  bookId: "b1",
  isbn: "9785377058562",
  title: "Математика, 8 класс",
  subject: "Математика",
  copies: 1,
  classNames: ["8-А"],
  ...over,
});

const loan = (over = {}) => ({
  loanId: "l1",
  isbn: "9785377058562",
  title: "Математика, 8 класс",
  student: "Иванов Иван",
  className: "8-А",
  issuedAt: "2026-09-01T08:00:00Z",
  ...over,
});

const run = (over = {}) =>
  buildStocktakeReport({ scanned: [], issuedLoans: [], catalog: [], ...over });

test("пустой скан — все секции пустые", () => {
  const r = run();
  assert.deepEqual(r, {
    scanned: 0,
    duplicates: 0,
    issuedNotFound: [],
    scannedButIssued: [],
    missingFromTowers: [],
    overCatalog: [],
    unknown: [],
  });
});

test("сканирована книга «в библиотеке» — отчёт чистый", () => {
  const r = run({ scanned: ["9785377058562"], catalog: [cat()] });
  assert.equal(r.scanned, 1);
  assert.equal(r.missingFromTowers.length, 0);
});

test("книга в каталоге, не выдана, не отсканирована → missingFromTowers", () => {
  const r = run({ catalog: [cat()] });
  assert.equal(r.missingFromTowers.length, 1);
  assert.equal(r.missingFromTowers[0].bookId, "b1");
});

test("активная выдача, книга не отсканирована → issuedNotFound", () => {
  const r = run({ catalog: [cat()], issuedLoans: [loan()] });
  assert.equal(r.issuedNotFound.length, 1);
  assert.equal(r.issuedNotFound[0].loanId, "l1");
  assert.equal(r.missingFromTowers.length, 0); // не дублируется
});

test("активная выдача, книга отсканирована → scannedButIssued", () => {
  const r = run({ scanned: ["978-5-377-058562"], catalog: [cat()], issuedLoans: [loan()] });
  assert.equal(r.scannedButIssued.length, 1);
  assert.equal(r.scannedButIssued[0].loanId, "l1");
  assert.equal(r.issuedNotFound.length, 0);
});

test("ISBN с дефисами скана совпадает с каталогом", () => {
  const r = run({ scanned: ["978-5377-058562"], catalog: [cat()] });
  assert.equal(r.unknown.length, 0);
  assert.equal(r.missingFromTowers.length, 0);
});

test("неизвестный ISBN → unknown (с счётчиком дублей)", () => {
  const r = run({ scanned: ["1112223334445", "111-222-333-4445"] });
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0].isbn, "1112223334445");
  assert.equal(r.unknown[0].count, 2);
  assert.equal(r.duplicates, 1);
});

test("дубли скана known-книги — duplicates, без unknown", () => {
  const r = run({ scanned: ["9785377058562", "9785377058562"], catalog: [cat()] });
  assert.equal(r.scanned, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.unknown.length, 0);
});

test("книга с двумя активными выдачами — оба в issuedNotFound", () => {
  const r = run({
    catalog: [cat()],
    issuedLoans: [loan(), loan({ loanId: "l2", student: "Петров Пётр" })],
  });
  assert.equal(r.issuedNotFound.length, 2);
});

test("фильтр по классу: чужая книга вне охвата", () => {
  const r = run({
    classId: "8-А",
    className: "8-А",
    catalog: [
      cat(),
      cat({ bookId: "b2", isbn: "1111111111111", title: "Физика, 9", subject: "Физика", classNames: ["9-А"] }),
    ],
  });
  assert.equal(r.missingFromTowers.length, 1);
  assert.equal(r.missingFromTowers[0].bookId, "b1");
});

test("фильтр по классу: выдача чужой книги не отчитывается", () => {
  const r = run({
    classId: "8-А",
    className: "8-А",
    catalog: [
      cat(),
      cat({ bookId: "b2", isbn: "2222222222222", title: "Физика, 9", subject: "Физика", classNames: ["9-А"] }),
    ],
    issuedLoans: [loan({ loanId: "l2", isbn: "2222222222222", title: "Физика, 9" })],
  });
  assert.equal(r.issuedNotFound.length, 0);
  assert.equal(r.missingFromTowers.length, 1);
  assert.equal(r.missingFromTowers[0].bookId, "b1");
});

test("фильтр: отсканирована чужая книга — unknown не возникает (она в каталоге)", () => {
  const r = run({
    classId: "8-А",
    className: "8-А",
    scanned: ["2222222222222"],
    catalog: [
      cat(),
      cat({ bookId: "b2", isbn: "2222222222222", title: "Физика, 9", subject: "Физика", classNames: ["9-А"] }),
    ],
  });
  assert.equal(r.unknown.length, 0);
  assert.equal(r.missingFromTowers.length, 1);
});

test("книга привязана к двум классам — попадает в охват обоих", () => {
  const r = run({
    classId: "9-А",
    className: "9-А",
    catalog: [cat({ classNames: ["8-А", "9-А"] })],
  });
  assert.equal(r.missingFromTowers.length, 1);
});

test("scanned = число уникальных ISBN (включая некаталожные)", () => {
  const r = run({ scanned: ["9785377058562", "1112223334445"], catalog: [cat()] });
  assert.equal(r.scanned, 2);
});

console.log("тиражи (copies)");

test("копии: выданы все, башня пуста — без missing, справка по выдачам", () => {
  // 3 экземпляра, все 3 выданы, в башне ничего → в норме.
  const r = run({
    catalog: [cat({ copies: 3 })],
    issuedLoans: [
      loan(),
      loan({ loanId: "l2", student: "Петров Пётр" }),
      loan({ loanId: "l3", student: "Сидорова Анна" }),
    ],
  });
  assert.equal(r.missingFromTowers.length, 0);
  assert.equal(r.scannedButIssued.length, 0);
  assert.equal(r.issuedNotFound.length, 3); // справка
  assert.equal(r.overCatalog.length, 0);
});

test("копии: должно быть 2 в башне, нашли 1 → missing 1", () => {
  // 4 экз., 1 выдан → 3 должны быть в башне; нашли 1.
  const r = run({
    catalog: [cat({ copies: 4 })],
    issuedLoans: [loan()],
    scanned: ["9785377058562"],
  });
  assert.equal(r.missingFromTowers.length, 1);
  assert.equal(r.missingFromTowers[0].missing, 2);
  assert.equal(r.missingFromTowers[0].expected, 3);
});

test("копии: все выданы, но копию нашли в башне → scannedButIssued", () => {
  // 2 экз., оба выданы (inLibrary=0); нашли 1 → возврат не зарегистрирован.
  const r = run({
    catalog: [cat({ copies: 2 })],
    issuedLoans: [loan(), loan({ loanId: "l2", student: "Петров Пётр" })],
    scanned: ["9785377058562"],
  });
  assert.equal(r.scannedButIssued.length, 1);
  assert.equal(r.missingFromTowers.length, 0);
});

test("копии: нормальные повторные сканы не ошибка (2 экз. = 2 скана)", () => {
  const r = run({
    catalog: [cat({ copies: 2 })],
    scanned: ["9785377058562", "9785377058562"],
  });
  assert.equal(r.duplicates, 1); // повторный скан учтён
  assert.equal(r.missingFromTowers.length, 0);
  assert.equal(r.scannedButIssued.length, 0);
  assert.equal(r.overCatalog.length, 0);
});

test("копии: сканов больше, чем всего экземпляров → overCatalog", () => {
  const r = run({
    catalog: [cat({ copies: 2 })],
    scanned: ["9785377058562", "9785377058562", "9785377058562"],
  });
  assert.equal(r.overCatalog.length, 1);
  assert.equal(r.overCatalog[0].scanned, 3);
  assert.equal(r.overCatalog[0].total, 2);
});

test("копии: выдача «лишнего» экземпляра — в отчёте без missing", () => {
  // 2 экз., выдано 2 (inLibrary=0), нашли 0 → всё выдано, в норме.
  const r = run({
    catalog: [cat({ copies: 2 })],
    issuedLoans: [loan(), loan({ loanId: "l2", student: "Петров Пётр" })],
  });
  assert.equal(r.missingFromTowers.length, 0);
  assert.equal(r.scannedButIssued.length, 0);
});

console.log("списанные копии (lost)");

test("списание: 2 экз., 1 утеряна, 1 в башне — отчёт чистый", () => {
  // inLibrary = 2 − 0 − 1 = 1; нашли 1 → в норме.
  const r = run({
    catalog: [cat({ copies: 2, lost: 1 })],
    scanned: ["9785377058562"],
  });
  assert.equal(r.missingFromTowers.length, 0);
  assert.equal(r.scannedButIssued.length, 0);
  assert.equal(r.overCatalog.length, 0);
});

test("списание: 2 экз., 1 утеряна, в башне пусто — не хватает 1", () => {
  // inLibrary = 1; нашли 0 → недостаёт одна (не «обе»).
  const r = run({
    catalog: [cat({ copies: 2, lost: 1 })],
  });
  assert.equal(r.missingFromTowers.length, 1);
  assert.equal(r.missingFromTowers[0].missing, 1);
  assert.equal(r.missingFromTowers[0].expected, 1);
});

test("списание: 2 экз., 1 утеряна + 1 выдана, башня пуста — без missing", () => {
  // inLibrary = 2 − 1 − 1 = 0; нашли 0 → всё объяснено, справка по выдаче.
  const r = run({
    catalog: [cat({ copies: 2, lost: 1 })],
    issuedLoans: [loan()],
  });
  assert.equal(r.missingFromTowers.length, 0);
  assert.equal(r.scannedButIssued.length, 0);
  assert.equal(r.issuedNotFound.length, 1); // справка
});

console.log(`\n${passed} прошло, ${failed} упало`);
if (failed > 0) process.exit(1);
