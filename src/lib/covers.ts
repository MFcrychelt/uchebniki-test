import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "covers");
const MAX_BYTES = 2 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function extFor(mime: string): string | null {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return null;
}

export async function ensureCoverDir() {
  await mkdir(DIR, { recursive: true });
}

export async function findCover(
  bookId: string
): Promise<{ file: string; type: string; buf: Buffer } | null> {
  try {
    const names = await readdir(DIR);
    const hit = names.find((n) => n.startsWith(`${bookId}.`));
    if (!hit) return null;
    const ext = path.extname(hit).toLowerCase();
    const type = MIME[ext];
    if (!type) return null;
    const buf = await readFile(path.join(DIR, hit));
    return { file: hit, type, buf };
  } catch {
    return null;
  }
}

export async function coverIds(): Promise<Set<string>> {
  try {
    const names = await readdir(DIR);
    return new Set(
      names
        .map((n) => n.replace(/\.(jpe?g|png|webp)$/i, ""))
        .filter((id, i, a) => a.indexOf(id) === i)
    );
  } catch {
    return new Set();
  }
}

export async function saveCover(
  bookId: string,
  buf: Buffer,
  mime: string
): Promise<void> {
  const ext = extFor(mime);
  if (!ext) throw new Error("Нужен JPEG, PNG или WebP");
  if (buf.length > MAX_BYTES) throw new Error("Файл больше 2 МБ");
  if (buf.length < 64) throw new Error("Файл слишком маленький");
  await ensureCoverDir();
  await removeCover(bookId);
  await writeFile(path.join(DIR, `${bookId}${ext}`), buf);
}

export async function removeCover(bookId: string): Promise<boolean> {
  await ensureCoverDir();
  let gone = false;
  try {
    const names = await readdir(DIR);
    for (const n of names) {
      if (!n.startsWith(`${bookId}.`)) continue;
      await unlink(path.join(DIR, n));
      gone = true;
    }
  } catch {
    // нет каталога
  }
  return gone;
}

export async function fetchCoverByIsbn(isbn: string): Promise<{
  buf: Buffer;
  mime: string;
} | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (clean.length < 10) return null;
  const url = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(clean)}-L.jpg`;
  const r = await fetch(url, {
    headers: { Accept: "image/*", "User-Agent": "uchebniki-project/1.0" },
    redirect: "follow",
  });
  if (!r.ok) return null;
  const mime = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  const buf = Buffer.from(await r.arrayBuffer());
  // Open Library отдаёт крошечный GIF/JPEG, если обложки нет.
  if (buf.length < 2000) return null;
  if (!extFor(mime) && mime !== "image/jpeg") return null;
  return { buf, mime: extFor(mime) ? mime : "image/jpeg" };
}

export const COVER_MAX_BYTES = MAX_BYTES;
