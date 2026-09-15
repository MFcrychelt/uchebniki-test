// Утилиты CSV: серверный заголовок ответа и клиентская загрузка файла.

export const CSV_HEADERS = {
  "Content-Type": "text/csv; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

/** BOM для корректного кириллического CSV в Excel. */
export const CSV_BOM = "\uFEFF";

export function csvContent(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    // Разделитель — точка с запятой (русская локаль Excel)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))];
  return CSV_BOM + lines.join("\r\n");
}

/** dateformat: 2026-09-13T…Z → 13.09.2026 */
export function ruDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU");
}

/**
 * Разбор CSV: автоопределение разделителя (';' или ','), кавычки
 * (включая "" внутри), CRLF/LF, BOM. Возвращает строки без пустых.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  let inQ = false;
  let semi = 0;
  let comma = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ";") semi++;
    else if (!inQ && ch === ",") comma++;
  }
  const delim = semi >= comma ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushCell();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (src[i + 1] !== "\n") pushRow();
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.length > 0));
}

export function csvFilename(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// --- Клиентская часть ---

/** Загрузить CSV-файл (res уже получен) — создаёт <a download>. */
export async function downloadCsv(res: Response, name: string): Promise<void> {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
