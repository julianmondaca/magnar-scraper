export const RATE_LIMIT = {
  minDelayMs: 2000,
  maxDelayMs: 30000,
  pdfDelayMs: 3000,
};

export const RETRY = {
  maxAttempts: 5,
  backoffFactor: 2,
  initialDelayMs: 2000,
};

export const PATHS = {
  dataDir: 'data',
  pdfsDir: 'pdfs',
  documentsFile: 'documents.json',
  failedPdfsFile: 'failed_pdfs.json',
  progressFile: 'progress.json',
};
