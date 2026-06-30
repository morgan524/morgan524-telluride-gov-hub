/**
 * CivicClerk agenda PDF extractor — Playwright + pdfjs.
 *
 * Used by content-refresh.js to pull the full agenda PDF body for County
 * (BOCC) meetings, so Task 1's Claude summary has the actual agenda
 * content instead of just metadata (eventName/description/category).
 *
 * Why a headless browser? CivicClerk's portal hosts agenda PDFs behind a
 * DocAccess viewer that gates downloads with a per-request url_hash
 * computed in-browser by the SPA. Server-side curl gets 500/405 from the
 * OData function call. The cheapest faithful path is to navigate the SPA
 * the same way a user would and intercept the PDF response from the
 * network.
 *
 * The browser is launched lazily on first use and reused across all
 * meetings in a single run. content-refresh.js calls closeBrowser() at
 * the end of main() to release the Chromium process before exit.
 */

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch({
    headless: true,
    // -no-sandbox is needed in some CI environments (GH Actions ubuntu-latest
    // doesn't strictly require it but the warning is annoying).
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return _browser;
}

async function closeBrowser() {
  if (!_browser) return;
  try { await _browser.close(); } catch { /* ignore */ }
  _browser = null;
}

/**
 * Navigate to a CivicClerk portal agenda URL and return the agenda PDF as
 * a Buffer (or null if no PDF response was intercepted before timeout).
 *
 *   portalUrl: https://<tenant>.portal.civicclerk.com/event/<id>/files/agenda/<fileId>
 */
async function extractCivicClerkAgendaPdf(portalUrl, opts = {}) {
  const timeout = opts.timeout || 45000;
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  const pdfBuffers = [];

  // Intercept every response that looks like a PDF. CivicClerk + DocAccess
  // route the actual PDF through whatever auth-token URL the SPA generates;
  // we don't care about the URL, only the bytes.
  page.on('response', async (resp) => {
    try {
      const ct = (resp.headers()['content-type'] || '').toLowerCase();
      const isPdfCT = ct.includes('application/pdf') ||
                      ct.includes('application/octet-stream');
      if (!isPdfCT) return;
      const buf = await resp.body();
      // Validate PDF magic bytes (%PDF-). Filter out small auth/error responses
      // that happen to be served as octet-stream.
      if (buf && buf.length > 1000 &&
          buf.slice(0, 5).toString('latin1') === '%PDF-') {
        pdfBuffers.push(buf);
      }
    } catch {
      // Ignore failures fetching a single response body — not every response
      // can be read after navigation (e.g. redirects).
    }
  });

  try {
    await page.goto(portalUrl, { waitUntil: 'networkidle', timeout });
    // Give the DocAccess viewer iframe an extra moment after networkidle —
    // sometimes the PDF fetch fires from inside an iframe after the parent
    // page is considered idle.
    await page.waitForTimeout(3000);
  } catch (e) {
    // Don't throw — navigation timeout or net::ERR_ABORTED is common when
    // the SPA initiates a download. Return whatever PDFs we already captured.
    if (process.env.DEBUG_CIVICCLERK) {
      console.warn(`  CivicClerk nav warning: ${e.message}`);
    }
  } finally {
    try { await ctx.close(); } catch { /* ignore */ }
  }

  // If multiple PDFs were caught (rare), the last one is usually the full
  // agenda — DocAccess sometimes loads a preview thumbnail first.
  return pdfBuffers.length ? pdfBuffers[pdfBuffers.length - 1] : null;
}

/**
 * Extract plain text from a PDF buffer via pdfjs-dist. Returns a single
 * string with page breaks as newlines. Best-effort: any per-page failures
 * are logged but don't abort the whole extraction.
 */
async function extractTextFromPdfBuffer(buffer) {
  const { text } = await extractPdfContent(buffer);
  return text;
}

/**
 * Extract BOTH text and link annotations from a PDF buffer. Used when
 * callers need to find URLs that aren't visible in the text layer —
 * e.g. agenda PDFs that print "Zoom Protocol Link to join" but only
 * carry the actual Zoom URL as a hyperlink annotation on the word "Link".
 *
 * Returns: { text: string, urls: string[] } where urls is the de-duped
 * list of all `/URI` annotation targets, in document order.
 */
async function extractPdfContent(buffer) {
  if (!buffer || !buffer.length) return { text: '', urls: [] };
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  } catch { /* auto-resolved in some packagings */ }

  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;

  const chunks = [];
  const urlSet = new Set();
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      chunks.push(content.items.map((it) => it.str).join(' '));
      const annots = await page.getAnnotations();
      for (const a of annots) {
        if (a && a.url && /^https?:/i.test(a.url)) urlSet.add(a.url);
      }
    } catch (e) {
      if (process.env.DEBUG_CIVICCLERK) {
        console.warn(`  pdfjs page ${i} extract warning: ${e.message}`);
      }
    }
  }
  return { text: chunks.join('\n'), urls: Array.from(urlSet) };
}

module.exports = {
  extractCivicClerkAgendaPdf,
  extractTextFromPdfBuffer,
  extractPdfContent,
  closeBrowser,
};
