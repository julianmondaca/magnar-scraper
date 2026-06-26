import fs from "fs";
import path from "path";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 200);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const DOCUMENTS_FILE = path.join("data", "documents.json");

export function loadDownloadedUuids(): Set<string> {
  try {
    const raw = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
    const docs: unknown[] = JSON.parse(raw);
    const uuids = new Set<string>();
    for (const doc of docs) {
      const d = doc as Record<string, unknown>;
      if (typeof d.uuid === "string") uuids.add(d.uuid);
      if (typeof d.pdfUrl === "string") {
        const m = (d.pdfUrl as string).match(/uuid=([^&]+)/);
        if (m) uuids.add(m[1]);
      }
    }
    return uuids;
  } catch {
    return new Set();
  }
}

export function appendDownloadRecord(record: {
  uuid: string;
  filename: string;
  source: string;
  downloadedAt: string;
  metadata?: Record<string, string>;
}): void {
  fs.mkdirSync("data", { recursive: true });
  let docs: unknown[] = [];
  try {
    const raw = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
    docs = JSON.parse(raw);
  } catch {
    docs = [];
  }
  docs.push(record);
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(docs, null, 2));
}
