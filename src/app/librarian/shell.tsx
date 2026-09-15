"use client";

import { lazy, Suspense, useState } from "react";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  BookOpenText,
  CheckCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import StaffUser from "@/components/staff-user";
import QueuePanel from "@/components/queue-panel";
import { PageHeader } from "@/components/ui/page-header";
import IssueFlow from "./issue-flow";

// Вкладки ленивые: каждый вью — отдельный чанк, грузится при первом
// открытии. Начальный бандл панели — только «Выдача» (дефолтная вкладка).
const DebtsView = lazy(() => import("./debts-view"));
const JournalView = lazy(() => import("./journal-view"));
const CatalogView = lazy(() => import("./catalog-view"));
const StatsView = lazy(() => import("./stats-view"));
const ReportView = lazy(() => import("./report-view"));
const StocktakeView = lazy(() => import("./stocktake-view"));
const RequestsView = lazy(() => import("./requests-view"));
const ClassesView = lazy(() => import("./classes-view"));

type Tab =
  | "issue"
  | "debts"
  | "journal"
  | "catalog"
  | "classes"
  | "stats"
  | "report"
  | "stocktake"
  | "requests";

const TABS: { id: Tab; label: string; icon: typeof CheckCheck }[] = [
  { id: "issue", label: "Выдача", icon: CheckCheck },
  { id: "debts", label: "Долги", icon: BookMarked },
  { id: "journal", label: "Журнал", icon: BookOpenText },
  { id: "catalog", label: "Каталог", icon: BookOpen },
  { id: "classes", label: "Классы", icon: GraduationCap },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "report", label: "Отчёт", icon: FileText },
  { id: "stocktake", label: "Переучёт", icon: ClipboardList },
  { id: "requests", label: "Заявки", icon: Inbox },
];

function TabFallback() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default function LibrarianShell({ userName }: { userName: string }) {
  const [tab, setTab] = useState<Tab>("issue");

  return (
    <main className="min-h-screen">
      <PageHeader
        icon={BookMarked}
        title="Панель библиотекаря"
        subtitle="Сканируйте QR ученика — и отмечайте учебники"
        actions={<StaffUser name={userName} />}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* Мобильный (<sm): горизонтальная лента вкладок без видимого
            скроллбара. Начиная с sm — сетка 4×2: все разделы видны,
            ничего не сжимается и не уезжает за скролл. */}
        <nav
          aria-label="Разделы"
          className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                // Крупные кнопки: пожилому сотруднику проще попасть пальцем
                "flex min-w-max shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-w-0",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>

        <QueuePanel />

        {tab === "issue" && <IssueFlow />}
        {tab === "debts" && (
          <Suspense fallback={<TabFallback />}>
            <DebtsView />
          </Suspense>
        )}
        {tab === "journal" && (
          <Suspense fallback={<TabFallback />}>
            <JournalView />
          </Suspense>
        )}
        {tab === "catalog" && (
          <Suspense fallback={<TabFallback />}>
            <CatalogView />
          </Suspense>
        )}
        {tab === "classes" && (
          <Suspense fallback={<TabFallback />}>
            <ClassesView />
          </Suspense>
        )}
        {tab === "stats" && (
          <Suspense fallback={<TabFallback />}>
            <StatsView />
          </Suspense>
        )}
        {tab === "report" && (
          <Suspense fallback={<TabFallback />}>
            <ReportView />
          </Suspense>
        )}
        {tab === "stocktake" && (
          <Suspense fallback={<TabFallback />}>
            <StocktakeView />
          </Suspense>
        )}
        {tab === "requests" && (
          <Suspense fallback={<TabFallback />}>
            <RequestsView />
          </Suspense>
        )}
      </div>
    </main>
  );
}
