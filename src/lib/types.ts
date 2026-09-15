// Общие типы ответов API.
export interface Book {
  id: string;
  isbn: string;
  title: string;
  subject: string;
  /** Сколько физических экземпляров в фонде. */
  copies?: number;
  /** Сколько ещё можно выдать (GET /api/books). */
  available?: number;
  /** Номер набора сезона (1–11); null — вне наборов (архив). */
  grade?: number | null;
  hasCover?: boolean;
}

export interface ClassInfo {
  id: string;
  name: string;
}

export type LoanStatus = "ISSUED" | "RETURNED" | "LOST";

export interface Loan {
  id: string;
  studentId: string;
  bookId: string;
  book?: Book;
  librarianId: string | null;
  status: LoanStatus;
  issuedAt: string;
  returnedAt: string | null;
}

export interface Student {
  id: string;
  role: "STUDENT" | "LIBRARIAN";
  qrToken: string | null;
  lastName: string;
  firstName: string;
  classId: string | null;
  class?: ClassInfo | null;
  loans?: Loan[];
  createdAt: string;
}

export interface ClassBook {
  classId: string;
  bookId: string;
  book: Book;
}

export interface ClassWithDetails {
  id: string;
  name: string;
  students: number;
  books: ClassBook[];
}

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  ISSUED: "Выдан",
  RETURNED: "Возвращён",
  LOST: "Утерян",
};
