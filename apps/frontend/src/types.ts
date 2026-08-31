/** Mirrors the status values the API and worker write to Document.status. */
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** A document is still moving through the pipeline in these states. */
export const IN_PROGRESS_STATUSES: DocumentStatus[] = ['UPLOADED', 'PROCESSING'];

export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  summary: string | null;
  /** Populated by the worker when processing fails, so the UI can explain why. */
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  /** Number of indexed chunks. Absent on the list endpoint. */
  chunkCount?: number;
}

export interface ChatSource {
  chunkIndex?: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
  sources?: ChatSource[];
  /** Set when the request failed, so the bubble can be styled as an error. */
  failed?: boolean;
}

export interface SearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex?: number;
  content: string;
  score: number;
}
