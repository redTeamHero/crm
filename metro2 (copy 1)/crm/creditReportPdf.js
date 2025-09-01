import { JSDOM } from 'jsdom';
import { parseCreditReportHTML } from './parser.js';
import { normalizeReport, renderHtml } from './creditAuditTool.js';
import { htmlToPdfBuffer } from './pdfUtils.js';

/**
 * Convert a raw credit report HTML string into a PDF buffer.
 * The parser extracts tradeline data, normalizes it for the audit tool,
 * renders a bureau comparison HTML report, and finally converts that to a PDF.
 *
 * @param {string} html - raw credit report HTML content
 * @param {Array|null} selections - optional subset selection for normalizeReport
 * @param {string} consumerName - name used when rendering the report
 * @returns {Promise<Buffer>} PDF buffer of the rendered report
 */
export async function creditReportHtmlToPdf(html, selections = null, consumerName = 'Consumer') {
  if (!html || typeof html !== 'string') throw new Error('HTML string required');
  const dom = new JSDOM(html);
  const parsed = parseCreditReportHTML(dom.window.document);
  const normalized = normalizeReport(parsed, selections);
  const reportHtml = renderHtml(normalized, consumerName);
  return await htmlToPdfBuffer(reportHtml);
}

export default creditReportHtmlToPdf;
