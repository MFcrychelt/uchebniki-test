import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { createStudentWithCredentials } from "@/lib/student-credentials";
import { db } from "@/lib/prisma";

/**
 * Массовый импорт учеников из CSV или Excel (.xlsx).
 * Тело: { csv?: string, xlsxBase64?: string, dryRun?: boolean }
 * Столбцы: Фамилия; Имя; Класс (класс необязателен; нового создаёт).
 * Порядок столбцов не важен — определяется по заголовку; без заголовка
 * — по порядку (фамилия, имя, класс).
 * Дубликаты (та же фамилия+имя+класс) пропускаются.
 *
 * Каждому новому ученику автоматически выдаются: QR-токен, логин
 * (фамилия в латинице + случайность), пароль и одноразовая ссылка
 * для входа (/invite/<токен>) — см. «Ссылки» в админке.
 *
 * dryRun — только разбор и отчёт, без записей.
 */

interface ParsedFile {
  rows: string[][];
  /** Индексы столбцов (по заголовку) или -1; null — без заголовка. */
  columns: { last: number; first: number; cls: number } | null;
  hasHeader: boolean;
}

/** Заголовок → индексы столбцов. «Имя» не должно путаться с «Фамилия». */
function mapColumns(header: string[]): {
  last: number;
  first: number;
  cls: number;
} | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const last = norm.findIndex((h) => h.includes("фамили"));
  const first = norm.findIndex((h) => h.includes("имя") && !h.includes("фамили"));
  const cls = norm.findIndex((h) => h.includes("класс"));
  if (last === -1 && first === -1 && cls === -1) return null;
  return { last, first, cls };
}

function parseXlsx(base64: string): ParsedFile {
  const wb = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("В файле нет листов");
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  })
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
    .filter((r) => r.some((c) => c.length > 0));
  if (rows.length === 0) throw new Error("В файле нет данных");

  const firstLine = rows[0] ?? [];
  const columns = mapColumns(firstLine);
  return { rows, columns, hasHeader: !!columns };
}

function parseCsvFile(text: string): ParsedFile {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("В файле нет данных");
  const columns = mapColumns(rows[0] ?? []);
  return { rows, columns, hasHeader: !!columns };
}

export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  let body: { csv?: string; xlsxBase64?: string; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ожидался JSON { csv } или { xlsxBase64 }" },
      { status: 400 }
    );
  }

  let parsed: ParsedFile;
  try {
    if (body.xlsxBase64) {
      parsed = parseXlsx(body.xlsxBase64);
    } else {
      const text = (body.csv ?? "").replace(/^\uFEFF/, "").trim();
      if (!text) {
        return NextResponse.json({ error: "CSV пуст" }, { status: 400 });
      }
      parsed = parseCsvFile(text);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Не удалось прочитать файл: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  const { rows, columns, hasHeader } = parsed;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) {
    return NextResponse.json({ error: "В файле нет данных" }, { status: 400 });
  }
  // Нужны минимум фамилия и имя.
  const lastIdx = columns ? columns.last : 0;
  const firstIdx = columns ? columns.first : 1;
  const clsIdx = columns ? columns.cls : 2;
  if (lastIdx === -1 || firstIdx === -1) {
    return NextResponse.json(
      { error: "Не найдены столбцы «Фамилия» и «Имя»" },
      { status: 400 }
    );
  }

  const write = !body.dryRun;

  const [students, classes] = await Promise.all([
    db.orm.public.User.where((u) => u.role.eq("STUDENT")).all(),
    db.orm.public.Class.all(),
  ]);

  const seen = new Set(
    students.map((s) => `${s.lastName}|${s.firstName}|${s.classId ?? ""}`)
  );
  const takenLogins = new Set(
    students.map((s) => s.login).filter((l): l is string => !!l)
  );
  const classByName = new Map(
    classes.map((c) => [c.name.trim().toLowerCase(), { id: c.id, name: c.name }])
  );
  const newClassIds = new Map<string, string | undefined>();

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let skipped = 0;
  let classesCreated = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNo = i + 1 + (hasHeader ? 1 : 0);
    const lastName = (row[lastIdx] ?? "").trim();
    const firstName = (row[firstIdx] ?? "").trim();
    const className = clsIdx >= 0 ? (row[clsIdx] ?? "").trim() : "";

    if (!lastName || !firstName) {
      errors.push({ row: rowNo, message: "Нужны фамилия и имя" });
      continue;
    }

    let classId: string | null = null;
    if (className) {
      const norm = className.toLowerCase();
      const existing = classByName.get(norm);
      if (existing) {
        classId = existing.id;
      } else if (!newClassIds.has(norm)) {
        if (write) {
          const c = await db.orm.public.Class.create({ name: className });
          newClassIds.set(norm, c.id);
          classByName.set(norm, { id: c.id, name: c.name });
          classesCreated++;
          classId = c.id;
        } else {
          newClassIds.set(norm, undefined);
        }
      } else {
        classId = newClassIds.get(norm) ?? null;
      }
    }

    const key = `${lastName}|${firstName}|${classId ?? ""}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    if (write) {
      // Логин/пароль/magic link создаются автоматически.
      await createStudentWithCredentials({
        lastName,
        firstName,
        classId,
        takenLogins,
      });
    }
    created++;
  }

  const newClasses = write ? classesCreated : [...newClassIds.values()].length;

  if (write && created > 0) {
    void logAudit("import.students", "import", guard.user, null, {
      created,
      skipped,
      newClasses,
      errors: errors.length,
    });
  }

  return NextResponse.json({
    dryRun: !write,
    total: dataRows.length,
    created,
    skipped,
    newClasses,
    errors,
  });
}
