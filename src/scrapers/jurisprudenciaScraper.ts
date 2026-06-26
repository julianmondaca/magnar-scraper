import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { logger } from "../utils/logger";
import { sleep, loadDownloadedUuids, appendDownloadRecord, sanitizeFileName } from "../utils/utils";

const BASE = "https://jurisprudencia.pj.gob.pe";
const INICIO_PATH = "/jurisprudenciaweb/faces/page/inicio.xhtml";
const RESULTADO_PATH = "/jurisprudenciaweb/faces/page/resultado.xhtml";
const INICIO_URL = `${BASE}${INICIO_PATH}`;
const RESULTADO_URL = `${BASE}${RESULTADO_PATH}`;
const DOWNLOAD_DIR = "pdf";
const LOGS_DIR = "logs";
const CONCURRENCY = 5;

const FORM_FIELDS: Record<string, string> = {
  "formBuscador:txtBusqueda": "",
  "formBuscador:buCorte": "1",
  "formBuscador:buDistrito": "0",
  "formBuscador:buEspecialidad": "0",
  "formBuscador:buPretensionValue": "",
  "formBuscador:buPretensionInput": "",
  "formBuscador:buPalabraClaveValue": "",
  "formBuscador:buPalabraClaveInput": "",
  "formBuscador:buNroExpediente": "",
  "formBuscador:buSala": "0",
  "formBuscador:buPretensionDelitoSupValue": "",
  "formBuscador:buPretensionDelitoSupInput": "",
  "formBuscador:buTipoRecurso": "0",
  "formBuscador:buTipoResolucion": "0",
  "formBuscador:buTipoResolucionInput": "-- Todos --",
  "formBuscador:buAnio": "",
  "formBuscador:buOrden": "21",
  "formBuscador:buOrdenForma": "DESC",
  "formBuscador:j_idt434": "on",
  "formBuscador:spinner": "1",
  "formBuscador:j_idt540": "on",
  "formBuscador:spinner2": "1",
};

const SEARCH_PARAMS: Record<string, string> = {
  "formBuscador:j_idt31": "formBuscador:j_idt31",
  "forward": "buscar",
  "busqueda": "especializada",
  "formBuscador:j_idt34": "21",
  "formBuscador:j_idt35": "DESC",
  "formBuscador:j_idt36": "Principal",
  "formBuscador:j_idt37": "1",
};

export class JurisprudenciaScraper {
  private session: AxiosInstance;
  private cookie = "";
  private viewState = "";
  private totalPages = 0;
  private totalUuids = 0;
  private newDownloads = 0;
  private skippedDownloads = 0;
  private downloadedUuids: Set<string> = new Set();
  private failedDownloads: { page: number; uuid: string; error: string }[] = [];
  private failedPages: number[] = [];
  private startTime = 0;

  constructor() {
    this.session = axios.create({
      timeout: 60000,
      maxRedirects: 0,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
      },
    });
  }

  async scrapeAll(): Promise<void> {
    this.startTime = Date.now();
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    fs.mkdirSync(LOGS_DIR, { recursive: true });

    this.downloadedUuids = loadDownloadedUuids();
    logger.info(`Loaded ${this.downloadedUuids.size} previously downloaded UUIDs`);

    logger.info("=== Jurisprudencia Scraper ===");

    const resultHtml = await this.executeSearch();
    if (!resultHtml) return;

    this.viewState = this.extractViewState(resultHtml);
    this.totalPages = this.extractMaxValue(resultHtml);

    if (!this.viewState) {
      logger.error("No ViewState after search");
      return;
    }

    logger.info(`Total pages: ${this.totalPages}, ViewState: ${this.viewState.substring(0, 40)}...`);

    const page1Uuids = this.extractUuids(resultHtml);
    this.totalUuids += page1Uuids.length;
    logger.info(`Page 1/?: ${page1Uuids.length} UUIDs`);

    const limit = pLimit(CONCURRENCY);
    if (page1Uuids.length > 0) {
      const tasks = page1Uuids.map((uuid) => limit(() => this.downloadPdf(uuid, 1)));
      await Promise.all(tasks);
    }

    const startPageElapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    logger.info(`Page 1/${this.totalPages} | ${this.newDownloads} new, ${this.skippedDownloads} skipped | ${startPageElapsed}s`);
    // Descomentar para realizar flujo completo
    // for (let page = 2; page <= this.totalPages; page++) {
    //   try {
    //     const xml = await this.ajaxPage(page);
    //     if (!xml) {
    //       logger.warn(`Page ${page} returned no response`);
    //       this.failedPages.push(page);
    //       continue;
    //     }

    //     this.viewState = this.extractViewStateFromXml(xml) || this.viewState;

    //     const pageHtml = this.extractPanelHtml(xml);
    //     if (!pageHtml) {
    //       logger.warn(`Page ${page}: no panel content`);
    //       this.failedPages.push(page);
    //       continue;
    //     }

    //     const uuids = this.extractUuids(pageHtml);
    //     this.totalUuids += uuids.length;

    //     if (uuids.length > 0) {
    //       const tasks = uuids.map((uuid) => limit(() => this.downloadPdf(uuid, page)));
    //       await Promise.all(tasks);
    //     }

    //     const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    //     logger.info(
    //       `Page ${page}/${this.totalPages} | UUIDs: ${uuids.length} | New: ${this.newDownloads} | Skipped: ${this.skippedDownloads} | Failed: ${this.failedDownloads.length} | ${elapsed}s`
    //     );

    //     if (this.failedDownloads.length > 0 && page % 100 === 0) {
    //       this.saveErrors();
    //     }
    //   } catch (err) {
    //     const msg = err instanceof Error ? err.message : String(err);
    //     logger.warn(`Page ${page} error: ${msg}`);
    //     this.failedPages.push(page);
    //     this.saveErrors();
    //   }
    // }

    this.saveErrors();
    this.printSummary();
  }

  private async executeSearch(): Promise<string | null> {
    try {
      logger.info("Fetching inicio.xhtml...");
      const initHtml = await this.get(INICIO_URL);
      this.viewState = this.extractViewState(initHtml);
      if (!this.viewState) {
        logger.error("No ViewState on inicio page");
        return null;
      }

      logger.info("Submitting search...");
      const payload = this.buildSearchPayload();

      const res = await this.session.request({
        method: "POST",
        url: this.urlWithCookie(INICIO_URL),
        data: payload,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: INICIO_URL,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        maxRedirects: 0,
        validateStatus: () => true,
        transformResponse: [(data: unknown) => data],
      });

      if (res.status === 500) {
        logger.error(`Search 500`);
        return null;
      }

      if (res.status === 302) {
        const resultHtml = await this.get(RESULTADO_URL);
        return resultHtml;
      }

      logger.warn(`Search returned status ${res.status}`);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Search failed: ${msg}`);
      return null;
    }
  }

  private async ajaxPage(page: number): Promise<string | null> {
    try {
      const body = this.buildAjaxPayload(page);
      const res = await this.session.post(
        this.urlWithCookie(RESULTADO_URL),
        body,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Faces-Request": "partial/ajax",
            "X-Requested-With": "XMLHttpRequest",
            Referer: RESULTADO_URL,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
          },
          validateStatus: () => true,
          transformResponse: [(data: unknown) => data],
        }
      );

      const xml = res.data as string;
      if (!xml.includes("partial-response") && !xml.includes("<update")) {
        logger.warn(`Page ${page}: response not AJAX`);
        return null;
      }

      const sc = res.headers["set-cookie"];
      if (sc) {
        this.cookie = Array.isArray(sc) ? sc.join("; ") : sc;
      }

      return xml;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Page ${page} AJAX failed: ${msg}`);
      return null;
    }
  }

  private buildSearchPayload(): string {
    const p = new URLSearchParams();
    p.set("formBuscador", "formBuscador");
    p.set("javax.faces.ViewState", this.viewState);
    for (const [k, v] of Object.entries(FORM_FIELDS)) {
      p.set(k, v);
    }
    for (const [k, v] of Object.entries(SEARCH_PARAMS)) {
      p.set(k, v);
    }
    return p.toString();
  }

  private buildAjaxPayload(page: number): string {
    const p = new URLSearchParams();
    p.set("formBuscador", "formBuscador");
    p.set("javax.faces.ViewState", this.viewState);
    for (const [k, v] of Object.entries(FORM_FIELDS)) {
      p.set(k, v);
    }
    const source = "formBuscador:data2";
    p.set("javax.faces.source", source);
    p.set("javax.faces.partial.ajax", "true");
    p.set("javax.faces.partial.execute", `${source} @component`);
    p.set("javax.faces.partial.render", "@component");
    p.set("javax.faces.partial.event", "rich:datascroller:onscroll");
    p.set(`${source}:page`, String(page));
    p.set("org.richfaces.ajax.component", source);
    p.set(source, source);
    p.set("AJAX:EVENTS_COUNT", "1");
    return p.toString();
  }

  private async downloadPdf(uuid: string, page: number): Promise<boolean> {
    if (this.downloadedUuids.has(uuid)) {
      this.skippedDownloads++;
      return true;
    }

    try {
      const res = await this.session.get(
        `https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/ServletDescarga?uuid=${uuid}`,
        {
          responseType: "arraybuffer",
          timeout: 15000,
          headers: {
            Referer: RESULTADO_URL,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
          },
        }
      );

      const buffer = Buffer.from(res.data);
      if (buffer.length < 100) {
        throw new Error(`Response too small: ${buffer.length} bytes`);
      }

      let filename = `${uuid}.pdf`;
      const disposition = res.headers["content-disposition"];
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const safeName = sanitizeFileName(filename);

      fs.writeFileSync(path.join(DOWNLOAD_DIR, safeName), buffer);
      this.downloadedUuids.add(uuid);
      this.newDownloads++;
      appendDownloadRecord({
        uuid,
        filename: safeName,
        source: "jurisprudencia",
        downloadedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.failedDownloads.push({ page, uuid, error: msg });
      return false;
    }
  }

  private extractViewState(html: string): string {
    const $ = cheerio.load(html);
    const val = $('input[name="javax.faces.ViewState"]').val();
    if (val) return String(val);

    const match = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
    return match?.[1] ?? "";
  }

  private extractViewStateFromXml(xml: string): string {
    const match = xml.match(/<update id="javax\.faces\.ViewState"><!\[CDATA\[(.*?)\]\]><\/update>/s);
    return match?.[1] ?? "";
  }

  private extractMaxValue(html: string): number {
    const maxMatch = html.match(/maxValue:\s*(\d+)/);
    if (maxMatch) return Math.max(1, parseInt(maxMatch[1], 10));

    const fallback = html.match(/Se\s+obtuvieron\s+(\d[\d,.]*)\s+resultados?/);
    if (fallback) {
      const num = parseInt(fallback[1].replace(/[,.]/g, ""), 10);
      if (num > 0) return Math.max(1, Math.ceil(num / 10));
    }

    return 1;
  }

  private extractUuids(html: string): string[] {
    const $ = cheerio.load(html);
    const uuids: string[] = [];

    $("a[href*='ServletDescarga']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const match = href.match(/uuid=([a-f0-9-]{36})/);
        if (match && !uuids.includes(match[1])) {
          uuids.push(match[1]);
        }
      }
    });

    if (uuids.length === 0) {
      const regex = /ServletDescarga\?uuid=([a-f0-9-]{36})/g;
      let m;
      while ((m = regex.exec(html)) !== null) {
        if (!uuids.includes(m[1])) uuids.push(m[1]);
      }
    }

    return uuids;
  }

  private extractPanelHtml(xml: string): string {
    const match = xml.match(
      /<update id="formBuscador:panel"><!\[CDATA\[(.*?)\]\]><\/update>/s
    );
    return match?.[1] ?? "";
  }

  private async get(url: string, attempts = 3): Promise<string> {
    for (let i = 1; i <= attempts; i++) {
      try {
        const res = await this.session.get(url, {
          headers: {
            ...(this.cookie ? { Cookie: this.cookie } : {}),
          },
          validateStatus: () => true,
          transformResponse: [(data: unknown) => data],
        });

        const sc = res.headers["set-cookie"];
        if (sc) {
          const cookies = Array.isArray(sc) ? sc : [sc];
          this.cookie = cookies.map((c: string) => c.split(";")[0]).join("; ");
        }

        if (res.status === 302) {
          const location = res.headers.location as string;
          if (!location) throw new Error("302 with no location");
          return this.get(location, attempts);
        }

        return res.data as string;
      } catch (err) {
        if (i === attempts) throw err;
        await sleep(i * 2000);
      }
    }
    throw new Error("GET exhausted");
  }

  private urlWithCookie(url: string): string {
    if (!this.cookie) return url;
    const match = this.cookie.match(/JSESSIONID=([^;]+)/);
    if (match) {
      return `${url};jsessionid=${match[1]}`;
    }
    return url;
  }

  private saveErrors(): void {
    fs.writeFileSync(
      path.join(LOGS_DIR, "failed-downloads.json"),
      JSON.stringify(this.failedDownloads, null, 2)
    );
    fs.writeFileSync(
      path.join(LOGS_DIR, "failed-pages.json"),
      JSON.stringify(this.failedPages, null, 2)
    );
  }

  private printSummary(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    logger.info("=== Summary ===");
    logger.info(`Pages: ${this.totalPages}`);
    logger.info(`Total UUIDs: ${this.totalUuids}`);
    logger.info(`New downloads: ${this.newDownloads}`);
    logger.info(`Skipped (already existed): ${this.skippedDownloads}`);
    logger.info(`Failed downloads: ${this.failedDownloads.length}`);
    logger.info(`Failed pages: ${this.failedPages.length}`);
    logger.info(`Time: ${elapsed}s`);
  }
}
