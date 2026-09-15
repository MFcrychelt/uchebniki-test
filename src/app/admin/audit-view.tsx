"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  ts: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
}

const ENTITY_LABELS: Record<string, string> = {
  class: "Класс",
  student: "Ученик",
  book: "Книга",
  classbook: "Связка",
  import: "Импорт",
  request: "Заявка",
  loan: "Выдача",
  auth: "Вход",
};

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Вход в систему",
  "auth.logout": "Выход",
  "class.create": "Создан класс",
  "class.delete": "Удалён класс",
  "student.create": "Создан ученик",
  "student.delete": "Удалён ученик",
  "book.create": "Добавлен учебник",
  "book.update": "Изменён тираж",
  "book.delete": "Удалён учебник",
  "book.enable": "Учебник возвращён в набор",
  "book.disable": "Учебник отключён из набора",
  "book.season": "Изменён набор учебника",
  "class.season": "Набор применён к классу",
  "set.create": "Создан набор",
  "set.rename": "Набор переименован",
  "set.delete": "Набор удалён",
  "set.add": "Учебник добавлен в набор",
  "set.remove": "Учебник убран из набора",
  "set.unlink-classes": "Набор убран из классов",
  "classbook.link": "Учебник привязан к классу",
  "classbook.unlink": "Учебник отвязан от класса",
  "import.students": "Импорт учеников",
  "import.books": "Импорт учебников",
  "request.fulfill": "Заявка выполнена (выдана)",
  "request.decline": "Заявка отклонена",
  "loan.compensate": "Утеря: отмечена компенсация",
  "loan.compensate.cancel": "Утеря: снята отметка о компенсации",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "админ",
  LIBRARIAN: "библиотекарь",
};

// { name: "8-В", class: "8-А", created: 3, errors: 0 } → "8-В · класс: 8-А · 3"
function formatDetails(d: Record<string, unknown> | null): string {
  if (!d) return "";
  const label: Record<string, string> = {
    name: "",
    title: "",
    isbn: "ISBN",
    subject: "предмет",
    class: "класс",
    bookId: "",
    created: "",
    skipped: "пропущено",
    newClasses: "новых классов",
    links: "связок",
    errors: "ошибок",
  };
  const renderValue = (v: unknown): string => {
    // { from: 2, to: 4 } → "2 → 4" (типовой случай — смена тиража)
    if (typeof v === "object" && v !== null && "from" in v && "to" in v) {
      const o = v as { from: unknown; to: unknown };
      return `${o.from} → ${o.to}`;
    }
    return String(v);
  };
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => {
      const keyLabel = label[k] ?? k;
      const val = renderValue(v);
      return keyLabel ? `${keyLabel}: ${val}` : val;
    })
    .join(" · ");
}

export default function AuditView() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (entity) p.set("entity", entity);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("limit", "300");
    setLoading(true);
    try {
      const res = await fetch(`/api/audit?${p}`);
      if (res.ok) setRows(await res.json());
      else setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entity, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const actor = (r: AuditEntry) =>
    r.actorName ? (
      <span>
        {r.actorName}
        {r.actorRole ? (
          <span className="text-muted-foreground">
            {" "}
            · {ROLE_LABELS[r.actorRole] ?? r.actorRole}
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-muted-foreground">система</span>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Раздел</label>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-2 text-base"
            >
              <option value="">Все</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">С даты</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-2 text-base"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">По дату</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-2 text-base"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Записей: <b className="text-foreground">{rows.length}</b>
            </span>
            <Button size="sm" variant="outline" onClick={load}>
              Обновить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            Журнал действий
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
          {!loading && rows.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Записей нет — журнал появится после первых действий.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const detail = formatDetails(r.details);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(r.ts).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {ENTITY_LABELS[r.entity] ?? r.entity}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                      {detail && (
                        <span className="text-sm text-muted-foreground"> — {detail}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs">{actor(r)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
