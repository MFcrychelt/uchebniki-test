// Номер набора сезона из названия учебника: «Математика, 8 класс» → 8.
// Используется при импорте, чтобы новые учебники сразу попадали в набор.
export function gradeFromTitle(title: string): number | null {
  const m = /(\d{1,2})\s*[-–—]?\s*класс/i.exec(title ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 11 ? n : null;
}
