"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  skipped: number;
  newClasses: number;
  links?: number;
  errors: { row: number; message: string }[];
}

const STUDENTS_TEMPLATE =
  "Фамилия;Имя;Класс\nИванов;Иван;8-А\nПетров;Пётр;8-А\nСидорова;Анна;8-Б";
const BOOKS_TEMPLATE =
  "ISBN;Название;Предмет;Класс\n9785377058562;Математика, 8 класс (Атанасян);Математика;8-А\n9785377018619;Физика, 8 класс (Перышкин);Физика;8-А";

function downloadTemplate(name: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportCard({
  title,
  hint,
  templateName,
  template,
  endpoint,
  hasLinks,
  onDone,
}: {
  title: string;
  hint: string;
  templateName: string;
  template: string;
  endpoint: "/api/import/students" | "/api/import/books";
  hasLinks?: boolean;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [xlsxBase64, setXlsxBase64] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasData = Boolean(csvText.trim() || xlsxBase64);

  const readFile = (file: File) => {
    setFileName(file.name);
    setError(null);
    setResult(null);
    setCsvText("");
    setXlsxBase64("");
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      file
        .arrayBuffer()
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          setXlsxBase64(btoa(bin));
        })
        .catch(() => setError("Не удалось прочитать файл"));
      return;
    }
    file
      .text()
      .then(setCsvText)
      .catch(() => setError("Не удалось прочитать файл"));
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          xlsxBase64
            ? { xlsxBase64, dryRun }
            : { csv: csvText, dryRun }
        ),
      });
      const j = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) setError(j.error ?? "Ошибка импорта");
      else {
        setResult(j);
        if (!dryRun) onDone();
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  const preview = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{hint}</p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-1 h-4 w-4" /> Выбрать файл…
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadTemplate(templateName, template)}
          >
            <Download className="mr-1 h-4 w-4" /> Шаблон
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground">{fileName}</span>
          )}
        </div>

        {preview.length > 0 && (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
            {preview.join("\n")}
            {csvText.split(/\r?\n/).filter((l) => l.trim()).length > 5 &&
              "\n…"}
          </pre>
        )}
        {xlsxBase64 && (
          <p className="text-xs text-muted-foreground">
            Excel-файл загружен (проверка по первым строкам недоступна).
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasData || busy}
            onClick={() => run(true)}
          >
            Проверить
          </Button>
          <Button size="sm" disabled={!hasData || busy} onClick={() => run(false)}>
            Импортировать
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {result && (
          <div
            className={cn(
              "rounded-md p-3 text-sm",
              result.dryRun ? "bg-muted" : "bg-success/10"
            )}
          >
            <p className="mb-1 flex items-center gap-2 font-medium">
              {!result.dryRun && (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
              {result.dryRun ? "Проверка (без записи)" : "Импорт завершён"}
            </p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>
                Строк: {result.total} ·{" "}
                {result.dryRun ? "будет создано" : "создано"}: {result.created}
              </li>
              <li>Пропущено дубликатов: {result.skipped}</li>
              {result.newClasses > 0 && (
                <li>
                  {result.dryRun ? "будет создано классов" : "создано классов"}:{" "}
                  {result.newClasses}
                </li>
              )}
              {hasLinks && (result.links ?? 0) > 0 && (
                <li>Привязок к классам: {result.links}</li>
              )}
            </ul>
            {result.errors.length > 0 && (
              <div className="mt-2 text-xs text-destructive">
                <p className="font-medium">Ошибки ({result.errors.length}):</p>
                <ul>
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      строка {e.row}: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li>… и ещё {result.errors.length - 10}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ImportView({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <ImportCard
        title="Импорт учеников (Excel / CSV)"
        hint="Excel (.xlsx) или CSV со столбцами Фамилия, Имя, Класс — порядок столбцов не важен, класс можно не указывать. Новые классы создаются автоматически, дубликаты пропускаются. Каждому ученику выдаются QR-токен, логин/пароль и одноразовая ссылка для входа (см. вкладку «Ссылки»)."
        templateName="students-template.csv"
        template={STUDENTS_TEMPLATE}
        endpoint="/api/import/students"
        onDone={onDone}
      />
      <ImportCard
        title="Импорт учебников"
        hint="CSV: ISBN; Название; Предмет; Класс (опционально — сразу привязать к классу). Дубликаты по ISBN пропускаются."
        templateName="books-template.csv"
        template={BOOKS_TEMPLATE}
        endpoint="/api/import/books"
        hasLinks
        onDone={onDone}
      />
      <p className="text-xs text-muted-foreground">
        Формат: разделитель «;» или «,», кавычки поддерживаются. Кнопка
        «Проверить» показывает, что будет создано, без записи в базу.
      </p>
    </div>
  );
}
