export interface DocumentData {
  id: string;
  fields: Record<string, string>;
  pdfUrl?: string;
  pdfFileName?: string;
  scrapedAt: Date;
}
