import { db } from "@/lib/prisma";
import PrintToolbar from "../toolbar";
import "../print.css";

export const dynamic = "force-dynamic";

// Печатные этикетки для книг каталога: /print/labels
export default async function PrintLabelsPage() {
  const books = await db.orm.public.Book
    .orderBy((b) => b.subject.asc())
    .all();

  return (
    <main className="print-page">
      <PrintToolbar backHref="/admin" />

      <h1>Этикетки учебников</h1>
      <p className="print-subtitle">{books.length} этикеток</p>

      <div className="label-grid">
        {books.map((b) => (
          <div key={b.id} className="book-label">
            <div>
              <p className="label-title">{b.title}</p>
              <p className="label-subject">{b.subject}</p>
            </div>
            <p className="label-isbn">ISBN {b.isbn}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
