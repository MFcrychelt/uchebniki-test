"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import StaffUser from "@/components/staff-user";
import QueuePanel from "@/components/queue-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StaffTabs, type StaffTabItem } from "@/components/ui/staff-tabs";
import { DATA_CHANGED_EVENT } from "@/lib/offline-queue-browser";
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
  | "requests"
  | "stats"
  | "report"
  | "stocktake";

/**
 * Порядок = порядок работы: сначала выдача и долги (ежедневно), потом
 * журнал/каталог/классы, в конце — редкие отчёты, переучёт и заявки.
 *
 * `inDock` — то, что живёт в нижнем доке телефона (не больше трёх:
 * дальше кнопки становятся слишком мелкими). Остальное — под «Ещё».
 */
const TABS: (StaffTabItem & { id: Tab })[] = [
  { id: "issue", label: "Выдача", icon: CheckCheck, inDock: true },
  { id: "debts", label: "Долги", icon: BookMarked, inDock: true },
  { id: "journal", label: "Журнал", icon: BookOpenText, inDock: true },
  { id: "catalog", label: "Каталог", icon: BookOpen },
  { id: "classes", label: "Классы", icon: GraduationCap },
  { id: "requests", label: "Заявки", icon: Inbox },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "report", label: "Отчёт", icon: FileText },
  { id: "stocktake", label: "Переучёт", icon: ClipboardList },
];

const TAB_IDS = TABS.map((t) => t.id) as string[];

function TabFallback() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default function LibrarianShell({ userName }: { userName: string }) {
  const params = useSearchParams();
  // PWA-ярлык («Выдача»/«Долги» на рабочем столе Android/iOS) приходит с
  // ?tab=… — открываем нужную вкладку одним касанием, без «найти глазами».
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    initial && TAB_IDS.includes(initial) ? (initial as Tab) : "issue"
  );
  // Счётчики «Долги»/«Заявки» на кнопках: видно, что горит, не заходя
  // внутрь. Открывается панель — один короткий запрос.
  const [badges, setBadges] = useState<{ debts: number; requests: number } | null>(null);
  // Запрос «сканировать» из дока: число > 0 = «открой камеру», после
  // обработки «Выдача» сбрасывает его, чтобы возврат на вкладку не
  // включал камеру заново.
  const [scanNonce, setScanNonce] = useState(0);

  // Возврат из браузера на ярлык, когда панель уже открыта.
  useEffect(() => {
    const t = params.get("tab");
    if (t && TAB_IDS.includes(t)) setTab(t as Tab);
  }, [params]);

  const refreshBadges = useCallback(() => {
    fetch("/api/staff/badges")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setBadges({ debts: Number(j.debts) || 0, requests: Number(j.requests) || 0 }))
      .catch(() => {});
  }, []);

  // Обновляем счётчики, когда вкладка снова на экране (вернулись из
  // чужого приложения, сменили таб) и когда офлайн-очередь ушла на сервер.
  useEffect(() => {
    refreshBadges();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBadges();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DATA_CHANGED_EVENT, refreshBadges);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshBadges);
    };
  }, [refreshBadges]);

  // Выдача/возврат меняют долги — перечитываем счётчик после смены вкладки
  // на «Долги» и обратно (дёшево: один COUNT-запрос на вкладку).
  useEffect(() => {
    if (tab === "debts" || tab === "journal" || tab === "requests") refreshBadges();
  }, [tab, refreshBadges]);

  const items: StaffTabItem[] = TABS.map((t) => ({
    ...t,
    badge:
      badges == null
        ? undefined
        : t.id === "debts"
          ? badges.debts
          : t.id === "requests"
            ? badges.requests
            : 0,
  }));

  const startScan = () => {
    setTab("issue");
    setScanNonce((n) => n + 1);
  };

  return (
    <main className="min-h-dvh">
      {/* Шапка НЕ липкая: липкой оставалась лента разделов — она нужнее
          при прокрутке длинного чек-листа, а два липких слоя подряд
          на слабом Android = лишняя перерисовка на каждый кадр. */}
      <PageHeader
        icon={BookMarked}
        title="Панель библиотекаря"
        subtitle="Сканируйте QR ученика — и отмечайте учебники"
        actions={<StaffUser name={userName} />}
        sticky={false}
      />

      {/* Телефон: одна колонка + нижний док. Планшет (sm–lg): лента
          разделов сверху. Монитор (lg+): панель разделов слева, рабочий
          стол в две колонки — каталогу с наборами нужна ширина. */}
      <div className="safe-x mx-auto w-full max-w-2xl px-4 lg:max-w-[1440px] lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-5 lg:px-6 lg:py-5">
        <div className="lg:sticky lg:top-5">
          <StaffTabs
            items={items}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            scan={{ label: "Скан", onStart: startScan }}
          />
        </div>

        <div className="min-w-0 space-y-4 py-4 pb-28 sm:pb-6 lg:py-0">
          <QueuePanel />

          {/* «Выдачу» не размонтируем при уходе на другую вкладку: профиль
              с неотмеченными галочками иначе терялся, а с нижним доком
              переключать вкладки стали гораздо чаще. */}
          <div className={tab === "issue" ? "" : "hidden"}>
            <IssueFlow scanNonce={scanNonce} onScanConsumed={() => setScanNonce(0)} />
          </div>
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
      </div>
    </main>
  );
}
