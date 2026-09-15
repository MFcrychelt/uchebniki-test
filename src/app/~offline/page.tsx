import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

export const metadata = { title: "Нет подключения" };

/**
 * Экран офлайн-заглушки (Serwist отдаёт его, когда документ не в кэше).
 * Он статический и пред-кеширован, поэтому открывается и без сети —
 * ровно то, что нужно в школьном здании, где интернет ловит не везде.
 */
export default function OfflinePage() {
  return (
    <main className="safe-x safe-b mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <section className="panel p-6 text-center sm:p-8">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
          <WifiOff className="h-6 w-6" aria-hidden />
        </span>
        <p className="eyebrow text-panel-muted">Нет подключения</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
          Интернет не отвечает
        </h1>
        <p className="panel-muted mx-auto mt-3 max-w-sm text-sm leading-relaxed">
          Список учебников и отметки, которые уже открыты, никуда не делись —
          они в памяти телефона. Проверьте Wi-Fi или мобильные данные и
          обновите страницу.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-panel-foreground px-6 text-sm font-bold text-panel transition-transform duration-100 active:scale-[0.985]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            ПОПРОБОВАТЬ СНОВА
          </Link>
        </div>
      </section>
      <p className="text-center text-xs text-muted-foreground">
        Выданные и запрошенные учебники видны и без сети: приложение держит
        их в кэше устройства.
      </p>
    </main>
  );
}
