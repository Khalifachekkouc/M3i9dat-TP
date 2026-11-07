"use client";

/**
 * Ticket -> PDF, entirely in the browser.
 *
 * The on-screen ticket element is drawn to a canvas by the browser itself
 * (html-to-image: SVG foreignObject, the page's own CSS and web fonts inlined),
 * then placed on a jsPDF page 80mm wide whose height follows the ticket.
 * Why a capture and not jsPDF text: the browser shapes Arabic (joined letters,
 * right-to-left) correctly with the embedded Noto Sans Arabic face, which
 * jsPDF's own text engine does not do reliably, and the PDF then matches the
 * screen exactly. Trade-off: the PDF text is an image, not selectable.
 */

const PAGE_WIDTH_MM = 80;
/** 80mm at 4x: about 1200px wide, sharp when zoomed. */
const PIXEL_RATIO = 4;

let fontCss: Promise<string> | null = null;

export async function downloadTicketPdf(element: HTMLElement, fileName: string): Promise<void> {
  const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

  // Fonts are inlined once per page load and reused for every ticket.
  fontCss ??= getFontEmbedCSS(element).catch(() => "");
  const fontEmbedCSS = await fontCss;
  await document.fonts.ready;

  const background = getComputedStyle(element).backgroundColor;
  const canvas = await toCanvas(element, {
    pixelRatio: PIXEL_RATIO,
    fontEmbedCSS,
    backgroundColor: background,
    cacheBust: false,
  });

  const heightMm = (PAGE_WIDTH_MM * canvas.height) / canvas.width;
  const pdf = new jsPDF({
    unit: "mm",
    format: [PAGE_WIDTH_MM, heightMm],
    // jsPDF swaps width and height for "portrait" when width > height.
    orientation: heightMm >= PAGE_WIDTH_MM ? "portrait" : "landscape",
    compress: true,
  });
  pdf.setProperties({ title: fileName.replace(/\.pdf$/, "") });
  pdf.addImage(canvas, "PNG", 0, 0, PAGE_WIDTH_MM, heightMm, undefined, "FAST");
  pdf.save(fileName);
}
