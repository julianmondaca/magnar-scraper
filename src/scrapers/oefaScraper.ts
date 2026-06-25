import fs from "fs";
import path from "path";
import { OefaClient } from "../httpClients/oefaClient";
import {
  extractViewState,
  extractSearchDocuments,
  extractPageDocuments,
  extractPageCount,
} from "../utils/oefaParser";
import { DocumentData } from "../types";
import { PATHS, RATE_LIMIT, RETRY } from "../config";
import { sleep, randomBetween, sanitizeFileName } from "../utils/utils";
import { logger } from "../utils/logger";

const URLs: Record<string, string> = {
  tfa: "https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml",
  dfsai: "https://publico.oefa.gob.pe/repdig/consulta/consultaDfsai.xhtml",
};

export class OefaScraper {
  private client: OefaClient;
  private url: string;
  private viewState = "";
  private allDocuments: DocumentData[] = [];
  private downloadedPdfs = 0;
  private failedPdfs = 0;

  constructor(site: keyof typeof URLs = "tfa") {
    this.url = URLs[site];
    this.client = new OefaClient();
  }

  async scrapeAll(): Promise<DocumentData[]> {
    logger.info(`Initializing OEFA scraper: ${this.url}`);
    fs.mkdirSync(PATHS.pdfsDir, { recursive: true });

    const initHtml = await this.client.init(this.url);
    this.viewState = this.extractViewStateFromHtml(initHtml);
    logger.info("ViewState obtained from initial page");

    logger.info("Executing search...");
    const searchResponse = await this.client.search(this.url, this.viewState);
    const searchState = extractViewState(searchResponse);
    if (searchState) this.viewState = searchState;

    const firstPageDocs = extractSearchDocuments(searchResponse);
    logger.info(`Page 1: ${firstPageDocs.length} documents`);

    await this.downloadPagePdfs(firstPageDocs);
    this.allDocuments.push(...firstPageDocs);

    const pageCount = extractPageCount(searchResponse);
    logger.info(`Total pages: ${pageCount}`);

    // Descomentar para descargar todos los documentos
    // for (let page = 2; page <= pageCount; page++) {
    //   await sleep(randomBetween(2000, 4000));

    //   const firstRow = (page - 1) * 10;
    //   const pageResponse = await this.client.loadPage(this.url, this.viewState, firstRow);

    //   const pageState = extractViewState(pageResponse);
    //   if (pageState) this.viewState = pageState;

    //   const pageDocs = extractPageDocuments(pageResponse);
    //   logger.info(`Page ${page}/${pageCount}: ${pageDocs.length} documents`);

    //   await this.downloadPagePdfs(pageDocs);
    //   this.allDocuments.push(...pageDocs);

    //   logger.info(`Progress: ${this.allDocuments.length} docs, ${this.downloadedPdfs} PDFs`);
    // }

    return this.allDocuments;
  }

  saveDocuments(): void {
    fs.mkdirSync(PATHS.dataDir, { recursive: true });
    const filePath = path.join(PATHS.dataDir, PATHS.documentsFile);
    fs.writeFileSync(filePath, JSON.stringify(this.allDocuments, null, 2), "utf-8");
    logger.info(`Saved ${this.allDocuments.length} documents to ${filePath}`);
  }

  get summary(): string {
    return `Documents: ${this.allDocuments.length}, PDFs downloaded: ${this.downloadedPdfs}, Failed: ${this.failedPdfs}`;
  }

  private async downloadPagePdfs(docs: DocumentData[]): Promise<void> {
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const uuid = this.extractUuid(doc);
      if (!uuid) continue;

      const success = await this.downloadPdfWithRetry(uuid, i);
      if (success) this.downloadedPdfs++;
      else this.failedPdfs++;

      if (i < docs.length - 1) {
        await sleep(RATE_LIMIT.pdfDelayMs);
      }
    }
  }

  private extractUuid(doc: DocumentData): string | undefined {
    if (doc.pdfUrl) {
      const match = doc.pdfUrl.match(/uuid=([^&]+)/);
      if (match) return match[1];
    }
    return undefined;
  }

  private async downloadPdfWithRetry(uuid: string, rowOnPage: number): Promise<boolean> {
    for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
      try {
        const { buffer, filename } = await this.client.downloadPdf(
          this.url,
          this.viewState,
          rowOnPage,
          uuid
        );

        if (buffer.length < 100) {
          throw new Error(`Response too small (${buffer.length} bytes)`);
        }

        const safeName = sanitizeFileName(filename || `${uuid}.pdf`);
        const filePath = path.join(PATHS.pdfsDir, safeName);

        fs.writeFileSync(filePath, buffer);
        logger.info(`  Downloaded: ${safeName} (${buffer.length} bytes)`);
        return true;
      } catch (error: unknown) {
        const err = error as { response?: { status?: number }; message?: string };
        const is429 = err.response?.status === 429;

        if (is429 && attempt < RETRY.maxAttempts) {
          const delay = RETRY.initialDelayMs * Math.pow(RETRY.backoffFactor, attempt - 1);
          const jittered = delay + Math.floor(Math.random() * 1000);
          logger.warn(
            `  429 on ${uuid} (attempt ${attempt}/${RETRY.maxAttempts}), retrying in ${(jittered / 1000).toFixed(1)}s`
          );
          await sleep(jittered);
          continue;
        }

        if (!is429) {
          logger.warn(`  Failed PDF ${uuid}: ${err.message || "Unknown error"}`);
          return false;
        }
      }
    }

    logger.warn(`  Failed PDF ${uuid} after ${RETRY.maxAttempts} attempts`);
    return false;
  }

  private extractViewStateFromHtml(html: string): string {
    const match = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
    return match?.[1] ?? "";
  }
}
