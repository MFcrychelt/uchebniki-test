/**
 * Лёгкая замена клиентской части `@serwist/window` (~245 КБ).
 *
 * Подключается через webpack-alias в next.config.ts: Serwist-плагин
 * инжектит в каждый initial-бандл `sw-entry.mjs`, который статически
 * импортирует `@serwist/window` — весь клиентский Workbox уходил бы в
 * каждый запрос. Нам нужен только `register()`, и нативного API
 * достаточно: вся кэш-логика живёт в самом sw.js (skipWaiting +
 * clientsClaim уже заданы в serwist.ts).
 *
 * Приложение API `window.serwist` не использует — достаточно этого
 * минимума.
 */
export class Serwist {
  private readonly swUrl: string;
  private readonly options: { scope?: string };

  constructor(swUrl: string, options: { scope?: string } = {}) {
    this.swUrl = swUrl;
    this.options = options;
  }

  async register(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    try {
      await navigator.serviceWorker.register(
        this.swUrl,
        this.options.scope ? { scope: this.options.scope } : undefined
      );
    } catch (err) {
      // Регистрация не критична для работы приложения (офлайн-фичи
      // просто будут недоступны) — не роняем страницу.
      console.warn("[pwa] регистрация service worker не удалась:", err);
    }
  }

  /** Совместимость с API @serwist/window (не используется). */
  async messageSW(): Promise<unknown> {
    return undefined;
  }
}
