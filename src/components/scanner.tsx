"use client";

// import type — обрезается при компиляции: в бандл библиотека НЕ
// попадает, только значения-типы. Сама библиотека грузится dynamic
// import'ом ниже (только при открытии камеры).
import type { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ScannerProps {
  /** Какие форматы декодировать. По умолчанию — только QR. */
  formats?: Html5QrcodeSupportedFormats[];
  onScan: (text: string) => void;
  onClose: () => void;
  onError?: (message: string) => void;
  /**
   * Размер рамки прицела: фиксированный прямоугольник или функция от
   * размера окна (на телефоне прицел должен занимать ~85% ширины, иначе
   * штрихкод книги в него не влезает).
   */
  qrbox?: { width: number; height: number } | ((w: number, h: number) => { width: number; height: number });
  /**
   * Непрерывный режим: не закрываться после первого кода — можно
   * отсканировать подряд много книг, не нажимая кнопку заново.
   * Повтор того же кода в течение 2с игнорируется.
   */
  continuous?: boolean;
  /** Текст кнопки закрытия (по умолчанию «Отмена»). */
  closeLabel?: string;
}

let scannerSeq = 0;

/**
 * Остановить сканер, не уронив страницу.
 *
 * html5-qrcode бросает СИНХРОННОЕ исключение из stop(), если камера
 * не запустилась («Cannot stop, scanner is not running or paused»).
 * Обычный .catch() не спасает — throw происходит до создания промиса,
 * падает unmount компонента и вся страница («This page couldn’t
 * load»). Поэтому stop/clear — в try/catch.
 */
function safeStop(s: Html5Qrcode | null) {
  if (!s) return;
  try {
    s.stop()
      .then(() => {
        try {
          s.clear();
        } catch {
          // чистка некритична
        }
      })
      .catch(() => {});
  } catch {
    // камера не запускалась — останавливать нечего
  }
}

// Камера-сканер. html5-qrcode (~400 КБ с декодерами) подгружается
// динамически — только когда компонент реально монтируется, т.е.
// библиотекарь нажал «Сканировать». В остальное время бандл чист.
export function Scanner({
  formats,
  onScan,
  onClose,
  onError,
  qrbox,
  continuous = false,
  closeLabel = "Отмена",
}: ScannerProps) {
  const idRef = useRef(`qr-scanner-${++scannerSeq}`);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;
  const startedRef = useRef(false);
  // Прицел по умолчанию — «почти на всю ширину», но не больше 320px:
  // на 360px-телефоне фиксированные 260px оставляют слишком мало места
  // под штрихкод книги, а на планшете библиотечный сканер не должен
  // растягиваться на весь экран.
  const box = qrbox ?? ((w: number, h: number) => {
    const width = Math.min(Math.round(w * 0.86), 320);
    return { width, height: Math.max(90, Math.min(Math.round(h * 0.45), 220)) };
  });
  // Подавление повторов: html5-qrcode зовёт callback снова и снова,
  // пока тот же код в кадре.
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    // Ленивый импорт: чанк с html5-qrcode грузится только сейчас.
    void (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled || startedRef.current) return;
        startedRef.current = true;
        scanner = new mod.Html5Qrcode(
          idRef.current,
          formats
            ? {
                verbose: false,
                formatsToSupport: formats,
                useBarCodeDetectorIfSupported: true,
              }
            : { verbose: false, useBarCodeDetectorIfSupported: true }
        );
        // Производительность камеры на слабом телефоне:
        //  - fps 6 вместо 10: декодер запускается реже, а QR/EAN всё ещё
        //    ловится с первого кадра (рука человека не настолько быстра);
        //  - useBarCodeDetectorIfSupported: если в браузере есть нативный
        //    BarcodeDetector (Chrome/Android — есть), декодирует ЖЕЛЕЗО,
        //    а не JS-библиотека: минус загрузка процессора и минус
        //    тряска кадров. html5-qrcode сам откатывается на свой декодер,
        //    если API нет (Safari/iOS).
        const lean =
          document.documentElement.dataset.perf === "lean";
        await scanner.start(
          { facingMode: "environment" },
          { fps: lean ? 4 : 6, qrbox: box },
          (text) => {
            const s = scanner;
            if (!s) return;
            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.text === text && now - last.at < 2000) return;
            lastScanRef.current = { text, at: now };
            if (!continuous) {
              // Однократный режим: после кода камеру выключаем.
              scanner = null;
              safeStop(s);
            }
            onScanRef.current(text);
          },
          // Ошибки декодирования одиночных кадров — игнорируем.
          () => {}
        );
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current?.(
            `Камера недоступна: ${
              err instanceof Error ? err.message : String(err)
            }. Введите код вручную.`
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      startedRef.current = false;
      const s = scanner;
      scanner = null;
      safeStop(s);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {/* Подсказка пожилому сотруднику: сканер срабатывает сам,
          ничего нажимать не надо. */}
      <p className="text-center text-sm text-muted-foreground">
        {continuous
          ? "Сканируйте книги одну за другой — камера не закроется."
          : "Наведите камеру на код — он распознается сам, нажимать ничего не надо."}
      </p>
      <div id={idRef.current} className="w-full overflow-hidden rounded-lg bg-black" />
      <button
        onClick={onClose}
        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <X className="h-4 w-4" /> {closeLabel}
      </button>
    </div>
  );
}
