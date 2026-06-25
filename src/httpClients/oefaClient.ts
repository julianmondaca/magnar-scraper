import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";
import { RATE_LIMIT } from "../config";
import { sleep } from "../utils/utils";

const FORM_NAME = "listarDetalleInfraccionRAAForm";
const TABLE_ID = `${FORM_NAME}:dt`;

export class OefaClient {
  private session: AxiosInstance;
  private cookie = "";
  private lastRequestTime = 0;

  constructor() {
    this.session = axios.create({
      maxRedirects: 10,
      withCredentials: true,
      timeout: 30000,
    });
  }

  async init(url: string): Promise<string> {
    logger.info(`Connecting to ${url}`);
    const response = await this.session.get(url);

    this.cookie = response.headers["set-cookie"]?.join("; ") ?? "";
    this.lastRequestTime = Date.now();

    logger.debug("Session initialized, cookies stored");
    return response.data;
  }

  async search(url: string, viewState: string): Promise<string> {
    logger.debug("Submitting search form");
    await this.enforceRateLimit();

    const params = new URLSearchParams();
    params.append("javax.faces.partial.ajax", "true");
    params.append("javax.faces.source", `${FORM_NAME}:btnBuscar`);
    params.append("javax.faces.partial.execute", "@all");
    params.append("javax.faces.partial.render", `${FORM_NAME}:pgLista ${FORM_NAME}:txtNroexp`);
    params.append(`${FORM_NAME}:btnBuscar`, `${FORM_NAME}:btnBuscar`);
    params.append(FORM_NAME, FORM_NAME);
    params.append(`${FORM_NAME}:dt_scrollState`, "0,0");
    params.append("javax.faces.ViewState", viewState);

    const response = await this.session.post(url, params.toString(), {
      headers: {
        Cookie: this.cookie,
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    this.lastRequestTime = Date.now();
    this.updateCookie(response);
    return response.data;
  }

  async loadPage(url: string, viewState: string, first: number): Promise<string> {
    logger.debug(`Loading page starting at row ${first}`);
    await this.enforceRateLimit();

    const params = new URLSearchParams();
    params.append("javax.faces.partial.ajax", "true");
    params.append("javax.faces.source", TABLE_ID);
    params.append("javax.faces.partial.execute", TABLE_ID);
    params.append("javax.faces.partial.render", TABLE_ID);
    params.append(TABLE_ID, TABLE_ID);
    params.append(`${TABLE_ID}_pagination`, "true");
    params.append(`${TABLE_ID}_first`, String(first));
    params.append(`${TABLE_ID}_rows`, "10");
    params.append(`${TABLE_ID}_skipChildren`, "true");
    params.append(`${TABLE_ID}_encodeFeature`, "true");
    params.append(FORM_NAME, FORM_NAME);
    params.append("javax.faces.ViewState", viewState);

    const response = await this.session.post(url, params.toString(), {
      headers: {
        Cookie: this.cookie,
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    this.lastRequestTime = Date.now();
    this.updateCookie(response);
    return response.data;
  }

  async downloadPdf(url: string, viewState: string, rowIndex: number, uuid: string): Promise<Buffer> {
    logger.debug(`Downloading PDF uuid=${uuid} row=${rowIndex}`);
    await this.enforceRateLimit();

    const params = new URLSearchParams();
    params.append(FORM_NAME, FORM_NAME);
    params.append("javax.faces.ViewState", viewState);
    params.append(
      `${FORM_NAME}:dt:${rowIndex}:j_idt63`,
      `${FORM_NAME}:dt:${rowIndex}:j_idt63`
    );
    params.append("param_uuid", uuid);

    const response = await this.session.post(url, params.toString(), {
      responseType: "arraybuffer",
      headers: {
        Cookie: this.cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    this.lastRequestTime = Date.now();
    this.updateCookie(response);
    return Buffer.from(response.data);
  }

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < RATE_LIMIT.minDelayMs && this.lastRequestTime > 0) {
      const wait = RATE_LIMIT.minDelayMs - elapsed;
      logger.debug(`Rate limit: waiting ${wait}ms`);
      await sleep(wait);
    }
  }

  private updateCookie(response: { headers: { "set-cookie"?: string[] } }): void {
    if (response.headers["set-cookie"]) {
      this.cookie = response.headers["set-cookie"].join("; ");
    }
  }
}
