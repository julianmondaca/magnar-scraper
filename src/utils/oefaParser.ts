import * as cheerio from 'cheerio';
import { DocumentData } from '../types';

const FORM_NAME = 'listarDetalleInfraccionRAAForm';
const TABLE_ID = `${FORM_NAME}:dt`;

export function extractViewState(responseData: string): string | null {
  const match = responseData.match(
    /<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/
  );
  return match?.[1] ?? null;
}

export function extractSearchDocuments(responseData: string): DocumentData[] {
  const html = extractHtmlFromResponse(responseData, `${FORM_NAME}:pgLista`);
  return parseTableRows(html, responseData);
}

export function extractPageDocuments(responseData: string): DocumentData[] {
  const html = extractHtmlFromResponse(responseData, TABLE_ID);
  return parseTableRows(html, responseData);
}

export function extractPageCount(responseData: string): number {
  const html = extractHtmlFromResponse(responseData, `${FORM_NAME}:pgLista`);
  if (!html) return 1;

  const $ = cheerio.load(html);
  const paginatorText = $('.ui-paginator-current').text().trim();
  const match = paginatorText.match(/de\s+(\d+)\s+\((\d+)/i);
  if (match) return Math.max(1, parseInt(match[1], 10));

  const rows = $(`tbody#${TABLE_ID}_data`).find('tr').not('.ui-datatable-empty-message').length;
  return rows > 0 ? 1 : 1;
}

function extractHtmlFromResponse(responseData: string, updateId: string): string {
  if (responseData.trim().startsWith('<?xml') || responseData.trim().startsWith('<partial-response')) {
    const updateRegex = new RegExp(
      `<update id="${escapeRegex(updateId)}"><!\\[CDATA\\[(.*?)\\]\\]></update>`,
      's'
    );
    const match = responseData.match(updateRegex);
    return match?.[1] ?? responseData;
  }
  return responseData;
}

function parseTableRows(html: string, rawResponse?: string): DocumentData[] {
  if (!html) return [];

  const $ = cheerio.load(html);
  const docs: DocumentData[] = [];

  const tableBody = $(`tbody#${TABLE_ID}_data`);
  if (tableBody.length === 0) return [];

  const rows = tableBody.find('tr').not('.ui-datatable-empty-message');
  if (rows.length === 0) return [];

  const commandLinkData = extractCommandLinkData(rawResponse || html);

  rows.each((idx, row) => {
    const cells = $(row).find('td');
    if (cells.length < 7) return;

    const nro = cells.eq(0).text().trim();
    const expediente = cells.eq(1).text().trim();
    const administrado = cells.eq(2).text().trim();
    const unidadFiscalizable = cells.eq(3).text().trim();
    const sector = cells.eq(4).text().trim();
    const resolucion = cells.eq(5).text().trim();

    const fields: Record<string, string> = {
      nro,
      expediente,
      administrado,
      unidadFiscalizable,
      sector,
      resolucion,
    };

    let pdfUrl: string | undefined;
    let uuid: string | undefined;

    const pdfLinkEl = cells.eq(6).find('a').first();
    if (pdfLinkEl.length > 0) {
      const onclick = pdfLinkEl.attr('onclick') || '';

      const windowOpenMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
      if (windowOpenMatch) {
        pdfUrl = windowOpenMatch[1];
        const uuidMatch = pdfUrl.match(/uuid=([^&]+)/);
        if (uuidMatch) uuid = uuidMatch[1];
      }
    }

    if (!pdfUrl && commandLinkData.length > idx) {
      uuid = commandLinkData[idx].uuid;
    }

    const doc: DocumentData = {
      id: `${idx + 1}`,
      fields,
      pdfUrl: uuid ? `/repdig/servlet/descarga?uuid=${uuid}` : pdfUrl,
      pdfFileName: expediente ? `${expediente}.pdf` : `documento_${idx + 1}.pdf`,
      scrapedAt: new Date(),
    };

    docs.push(doc);
  });

  return docs;
}

function extractCommandLinkData(html: string): { rowIndex: number; uuid: string }[] {
  const regex = /listarDetalleInfraccionRAAForm:dt:(\d+):j_idt63[\s\S]*?param_uuid':'([^']+)'/g;
  const results: { rowIndex: number; uuid: string }[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    results.push({
      rowIndex: Number(match[1]),
      uuid: match[2],
    });
  }

  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
