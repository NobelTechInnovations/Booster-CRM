import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Server-side PDF version of the same Tax Invoice shown in the app
// (components/orders-view.jsx's InvoiceModal) — needed so it can be
// attached to a WhatsApp document message, which requires a real file,
// not the browser-only print-to-PDF the app UI uses. Kept intentionally
// simple (one page, no wrapped multi-line item titles) rather than
// pixel-matching the HTML version — pdf-lib has no layout engine, every
// line is manually positioned.

const PAGE_WIDTH = 595.28;  // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.47, 0.55);
const LINE = rgb(0.85, 0.87, 0.9);
const ROSE = rgb(0.72, 0.11, 0.24);

function money(n) {
  return `Rs ${Number(n || 0).toFixed(2)}`;
}

function truncate(text, max) {
  const t = String(text || "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function buildInvoicePdf({ order, company }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;
  const left = MARGIN;
  const right = PAGE_WIDTH - MARGIN;

  const gstRate = Number(company?.taxSettings?.gstRate ?? 5);
  const invoicePrefix = company?.taxSettings?.invoicePrefix || "INV";
  const invoiceNumber = `${invoicePrefix}-${order.orderNumber || String(order.name || "").replace(/[^0-9]/g, "") || order.externalId}`;
  const legalName = company?.legalName || company?.kyc?.legalName || company?.name || "Your Company";
  const gstin = company?.gstin || company?.kyc?.gstin || "";
  const registeredAddress = company?.address?.line1
    ? [company.address.line1, company.address.line2, company.address.city, company.address.state, company.address.pincode].filter(Boolean).join(", ")
    : company?.kyc?.registeredAddress || "";

  const lineItems = order.lineItems || order.line_items || [];
  const itemsTotal = lineItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const discount = Number(order.totalDiscounts || 0) + Number(order.manualDiscount || 0);
  const shipping = Number(order.totalShipping || 0);
  const extraCharge = Number(order.manualExtraCharge || 0);
  const total = Number(order.totalPrice || 0);
  const taxableValue = Math.round((total / (1 + gstRate / 100)) * 100) / 100;
  const taxAmount = Math.round((total - taxableValue) * 100) / 100;

  function text(str, x, size, opts = {}) {
    page.drawText(str, { x, y, size, font: opts.bold ? bold : font, color: opts.color || INK });
  }
  function row(labelLeft, valueRight, size = 10, opts = {}) {
    text(labelLeft, left, size, opts);
    const valueFont = opts.bold ? bold : font;
    const w = valueFont.widthOfTextAtSize(valueRight, size);
    text(valueRight, right - w, size, opts);
  }
  function hr(color = LINE) {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color });
  }

  // ── Letterhead ──
  text("TAX INVOICE", right - bold.widthOfTextAtSize("TAX INVOICE", 9), 9, { bold: true, color: MUTED });
  text(legalName, left, 17, { bold: true });
  y -= 16;
  if (gstin) { text(`GSTIN ${gstin}`, left, 9, { color: MUTED }); y -= 12; }
  if (registeredAddress) { text(truncate(registeredAddress, 70), left, 9, { color: MUTED }); y -= 12; }
  y -= 6;
  text(`Invoice #: ${invoiceNumber}`, left, 9, { color: MUTED });
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const dateLabel = `Date: ${dateStr}`;
  text(dateLabel, right - font.widthOfTextAtSize(dateLabel, 9), 9, { color: MUTED });
  y -= 16;
  hr();
  y -= 20;

  // ── Bill To / Ship To ──
  const addr = order.shippingAddress || {};
  text("BILL TO", left, 8, { bold: true, color: MUTED });
  text("SHIP TO", left + 280, 8, { bold: true, color: MUTED });
  y -= 13;
  text(truncate(order.customerName || "Customer", 34), left, 11, { bold: true });
  text(truncate(addr.name || order.customerName || "Customer", 34), left + 280, 11, { bold: true });
  y -= 13;
  if (order.phone) { text(order.phone, left, 9, { color: MUTED }); }
  const shipLine1 = [addr.address1, addr.address2].filter(Boolean).join(", ");
  if (shipLine1) text(truncate(shipLine1, 38), left + 280, 9, { color: MUTED });
  y -= 12;
  const shipLine2 = [addr.city, addr.province, addr.zip].filter(Boolean).join(", ");
  if (shipLine2) text(truncate(shipLine2, 38), left + 280, 9, { color: MUTED });
  y -= 20;
  hr();
  y -= 16;

  // ── Item table ──
  text("ITEM", left, 8, { bold: true, color: MUTED });
  text("QTY", left + 330, 8, { bold: true, color: MUTED });
  text("RATE", left + 390, 8, { bold: true, color: MUTED });
  text("AMOUNT", right - font.widthOfTextAtSize("AMOUNT", 8), 8, { bold: true, color: MUTED });
  y -= 8;
  hr();
  y -= 15;

  for (const item of lineItems) {
    const amount = Number(item.price || 0) * Number(item.quantity || 1);
    text(truncate(item.title || item.name || "Item", 44), left, 10);
    text(String(item.quantity || 1), left + 330, 10);
    text(Number(item.price || 0).toFixed(2), left + 390, 10);
    const amtStr = amount.toFixed(2);
    text(amtStr, right - font.widthOfTextAtSize(amtStr, 10), 10, { bold: true });
    y -= 16;
    if (y < 200) break; // safety margin — extremely long carts get truncated rather than overflow the page
  }
  y -= 4;
  hr();
  y -= 20;

  // ── Totals — same two-block structure as the in-app invoice: what was
  // charged (sums to Total Amount), then that same total's GST breakup. ──
  row("Items Total", money(itemsTotal));
  y -= 14;
  if (discount > 0) { row("Discount", `-${money(discount)}`, 10, { color: ROSE }); y -= 14; }
  if (shipping > 0) { row("Shipping", `+${money(shipping)}`); y -= 14; }
  if (extraCharge > 0) { row(order.manualAdjustmentNote || "Extra Charge", `+${money(extraCharge)}`); y -= 14; }
  hr();
  y -= 14;
  row("Total Amount", money(total), 11, { bold: true });
  y -= 22;

  text("GST BREAKUP — ALREADY INCLUDED IN TOTAL AMOUNT ABOVE", left, 7.5, { bold: true, color: MUTED });
  y -= 13;
  row("Taxable Value", money(taxableValue), 9, { color: MUTED });
  y -= 13;
  row(`+ GST @ ${gstRate}%`, money(taxAmount), 9, { color: MUTED });
  y -= 13;
  row("= Total Amount", money(total), 9, { color: MUTED });
  y -= 22;

  page.drawRectangle({ x: left, y: y - 10, width: right - left, height: 28, color: rgb(0.06, 0.09, 0.16) });
  text("GRAND TOTAL", left + 8, 12, { bold: true, color: rgb(1, 1, 1) });
  const grandStr = money(total);
  text(grandStr, right - 8 - bold.widthOfTextAtSize(grandStr, 13), 13, { bold: true, color: rgb(1, 1, 1) });
  y -= 30;

  y -= 14;
  text(
    "Prices are GST-inclusive. GST is not charged on top of the Total Amount — the breakup above only shows how much of it is taxable value vs. tax.",
    left, 7.5, { color: MUTED },
  );
  y -= 20;
  text("Computer-generated invoice — no signature required.", left, 8, { color: MUTED });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
