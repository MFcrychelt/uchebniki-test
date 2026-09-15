import type { Html5QrcodeSupportedFormats } from "html5-qrcode";

/**
 * Форматы штрихкодов для ISBN (EAN/UPC/Code-128/Code-39) + QR.
 *
 * Числа — значения констант `Html5QrcodeSupportedFormats` из html5-qrcode
 * (связный enum: QR_CODE=0, CODE_39=3, CODE_128=5, EAN_13=9, EAN_8=10,
 * UPC_A=14). Дублируем значения, чтобы НЕ тянуть саму библиотеку
 * (~400 КБ) в начальный бандл: она подгружается лениво, только когда
 * пользователь реально открывает камеру (см. `@/components/scanner`).
 */
export const BOOK_FORMATS: Html5QrcodeSupportedFormats[] = [
  9, // EAN_13
  10, // EAN_8
  14, // UPC_A
  5, // CODE_128
  3, // CODE_39
  0, // QR_CODE
];

/** Только QR (личный код ученика). */
export const QR_FORMATS: Html5QrcodeSupportedFormats[] = [0]; // QR_CODE
