import PDFDocument from 'pdfkit';
import { brandImage } from './brand';
import type { Block, ReportContent } from './content';

/**
 * PDF rendering for report content.
 *
 * The renderer only draws blocks produced by the content builder; it never
 * computes scores of its own, so a report can never disagree with the
 * application about a number.
 */

const NAVY = '#081530';
const SLATE = '#51627f';
const LIGHT = '#d5e1f5';
const BLUE = '#0372e5';
const RED = '#b91c1c';
const AMBER = '#b45309';
const WHITE = '#ffffff';

const PAGE_MARGIN = 56;
const HEADER_SPACE = 40;
const FOOTER_SPACE = 46;

/** Map characters outside the built-in Helvetica (WinAnsi) repertoire. */
export function sanitizePdfText(input: string): string {
  return (
    input
      .replace(/[\u2018\u2019\u201a\u2039\u203a]/g, "'")
      .replace(/[\u201c\u201d\u201e]/g, '"')
      .replace(/\u2013|\u2014/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '-')
      .replace(/\u00a0/g, ' ')
      .replace(/\u2265/g, '>=')
      .replace(/\u2264/g, '<=')
      .replace(/\u00d7/g, 'x')
      .replace(/\u221e/g, 'inf')
      .replace(/\u2192/g, '->')
      .replace(/\u2713|\u2714/g, '[x]')
      .replace(/\u2717|\u2718/g, '[ ]')
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')
  );
}

export interface RenderOptions {
  content: ReportContent;
  /** Optional generated-at label shown in the footer. */
  footerNote?: string;
}

export async function renderReportPdf(options: RenderOptions): Promise<Buffer> {
  const { content } = options;
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: sanitizePdfText(content.title),
      Author: sanitizePdfText(content.organization),
      Subject: sanitizePdfText(`${content.type} report for ${content.customer.name}`),
      Creator: 'ODCMP',
    },
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', (err) => reject(err));
  });

  const state = {
    y: PAGE_MARGIN + HEADER_SPACE,
    contentWidth: doc.page.width - PAGE_MARGIN * 2,
  };

  const bottomLimit = () => doc.page.height - PAGE_MARGIN - FOOTER_SPACE;

  const newPage = () => {
    doc.addPage();
    state.y = PAGE_MARGIN + HEADER_SPACE;
  };

  const ensureSpace = (height: number) => {
    if (state.y + height > bottomLimit()) newPage();
  };

  const heading = (text: string, level: 1 | 2 | 3) => {
    const sizes: Record<number, number> = { 1: 20, 2: 14, 3: 11.5 };
    const sizesBefore = sizes[level];
    const before = level === 1 ? 0 : level === 2 ? 18 : 12;
    doc.font(level === 1 ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(sizesBefore);
    const clean = sanitizePdfText(text);
    const height = doc.heightOfString(clean, { width: state.contentWidth, lineGap: 2 });
    ensureSpace(before + height + 6);
    state.y += before;
    if (level === 2) {
      doc
        .fillColor(BLUE)
        .rect(PAGE_MARGIN, state.y - 4, 3, height + 4)
        .fill();
      doc.fillColor(NAVY).text(clean, PAGE_MARGIN + 10, state.y, {
        width: state.contentWidth - 10,
        lineGap: 2,
      });
    } else {
      doc.fillColor(level === 1 ? NAVY : SLATE).text(clean, PAGE_MARGIN, state.y, {
        width: state.contentWidth,
        lineGap: 2,
      });
    }
    state.y = doc.y + 6;
    doc.fillColor(NAVY);
  };

  const paragraph = (text: string) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(NAVY);
    const clean = sanitizePdfText(text);
    const h = doc.heightOfString(clean, { width: state.contentWidth, lineGap: 3 });
    ensureSpace(Math.min(h, 400));
    doc.text(clean, PAGE_MARGIN, state.y, {
      width: state.contentWidth,
      lineGap: 3,
      align: 'justify',
    });
    state.y = doc.y + 8;
  };

  const bullets = (items: string[]) => {
    doc.font('Helvetica').fontSize(9.5);
    for (const item of items) {
      const clean = sanitizePdfText(item);
      const indent = 14;
      const h = doc.heightOfString(clean, { width: state.contentWidth - indent, lineGap: 2 });
      ensureSpace(h + 6);
      doc.fillColor(BLUE).text('-', PAGE_MARGIN + 2, state.y, { width: 10 });
      doc.fillColor(NAVY).text(clean, PAGE_MARGIN + indent, state.y, {
        width: state.contentWidth - indent,
        lineGap: 2,
      });
      state.y = doc.y + 4;
    }
    state.y += 6;
  };

  const kv = (pairs: [string, string][]) => {
    doc.font('Helvetica').fontSize(9);
    const labelWidth = state.contentWidth * 0.32;
    for (const [label, value] of pairs) {
      const l = sanitizePdfText(label);
      const v = sanitizePdfText(String(value));
      const vh = doc.heightOfString(v, { width: state.contentWidth - labelWidth - 8, lineGap: 1 });
      const h = Math.max(14, vh + 4);
      ensureSpace(h);
      doc.fillColor(SLATE).text(l, PAGE_MARGIN, state.y, { width: labelWidth });
      doc.fillColor(NAVY).text(v, PAGE_MARGIN + labelWidth + 8, state.y, {
        width: state.contentWidth - labelWidth - 8,
        lineGap: 1,
      });
      state.y = Math.max(doc.y, state.y + 12) + 3;
      doc
        .fillColor(LIGHT)
        .rect(PAGE_MARGIN, state.y - 2, state.contentWidth, 0.5)
        .fill();
    }
    state.y += 8;
  };

  const table = (headers: string[], rows: string[][], align?: ('left' | 'right')[]) => {
    doc.font('Helvetica').fontSize(8.5);
    const cleanHeaders = headers.map(sanitizePdfText);
    const cleanRows = rows.map((r) => r.map((c) => sanitizePdfText(String(c ?? ''))));

    // Column widths proportional to observed content, clamped to stay readable.
    const weights = cleanHeaders.map((_, col) => {
      const maxLen = Math.max(
        cleanHeaders[col].length,
        ...cleanRows.map((r) => (r[col] ?? '').length),
        8,
      );
      return Math.min(Math.max(maxLen, 10), 60);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let widths = weights.map((w) => (w / total) * state.contentWidth);
    const minW = 46;
    const tooSmall = widths.filter((w) => w < minW).length;
    if (tooSmall > 0) {
      const deficit = widths.reduce((sum, w) => sum + (w < minW ? minW - w : 0), 0);
      const surplus = widths.reduce((sum, w) => sum + Math.max(0, w - minW), 0);
      if (surplus > 0) {
        widths = widths.map((w) =>
          w < minW ? minW : w - (Math.max(0, w - minW) / surplus) * deficit,
        );
      }
    }

    const padding = 5;
    const cellText = (text: string, width: number) =>
      doc.heightOfString(text, { width: width - padding * 2, lineGap: 1 });

    const drawHeaderRow = () => {
      const h = Math.max(...cleanHeaders.map((t, i) => cellText(t, widths[i])), 14) + padding * 2;
      ensureSpace(h + 2);
      let x = PAGE_MARGIN;
      doc.rect(PAGE_MARGIN, state.y, state.contentWidth, h).fill(NAVY);
      cleanHeaders.forEach((t, i) => {
        doc
          .fillColor(WHITE)
          .font('Helvetica-Bold')
          .text(t, x + padding, state.y + padding, {
            width: widths[i] - padding * 2,
            align: align?.[i] ?? 'left',
          });
        x += widths[i];
      });
      state.y += h;
      doc.font('Helvetica').fontSize(8.5).fillColor(NAVY);
    };

    drawHeaderRow();

    cleanRows.forEach((row, rowIndex) => {
      const heights = row.map((t, i) => cellText(t, widths[i]));
      const h = Math.max(...heights, 14) + padding * 2;
      if (state.y + h > bottomLimit()) {
        newPage();
        drawHeaderRow();
      }
      if (rowIndex % 2 === 1) {
        doc.rect(PAGE_MARGIN, state.y, state.contentWidth, h).fill('#f4f8ff');
      }
      let x = PAGE_MARGIN;
      row.forEach((t, i) => {
        doc.fillColor(NAVY).text(t, x + padding, state.y + padding, {
          width: widths[i] - padding * 2,
          align: align?.[i] ?? 'left',
          lineGap: 1,
        });
        x += widths[i];
      });
      doc
        .strokeColor(LIGHT)
        .lineWidth(0.5)
        .rect(PAGE_MARGIN, state.y, state.contentWidth, h)
        .stroke();
      state.y += h;
    });
    state.y += 10;
    doc.fillColor(NAVY);
  };

  const chart = (
    title: string,
    data: { label: string; value: number }[],
    max: number,
    unit: string,
  ) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY);
    ensureSpace(30);
    doc.text(sanitizePdfText(title), PAGE_MARGIN, state.y);
    state.y = doc.y + 6;

    const labelWidth = state.contentWidth * 0.42;
    const barMax = state.contentWidth - labelWidth - 54;

    for (const item of data) {
      const rowH = 18;
      ensureSpace(rowH);
      doc.font('Helvetica').fontSize(8.5).fillColor(SLATE);
      doc.text(sanitizePdfText(item.label), PAGE_MARGIN, state.y + 3, {
        width: labelWidth - 6,
        ellipsis: true,
      });
      const barX = PAGE_MARGIN + labelWidth;
      const unknown = item.value < 0;
      const ratio = unknown ? 0 : Math.max(0, Math.min(1, item.value / max));
      const barW = barMax * ratio;
      doc.rect(barX, state.y + 3, barMax, 11).fill(LIGHT);
      const color = unknown ? SLATE : item.value >= 75 ? BLUE : item.value >= 55 ? AMBER : RED;
      if (barW > 0) doc.rect(barX, state.y + 3, barW, 11).fill(color);
      doc
        .font('Helvetica-Bold')
        .fillColor(unknown ? SLATE : NAVY)
        .text(unknown ? 'n/a' : `${item.value.toFixed(1)}${unit}`, barX + barMax + 6, state.y + 3, {
          width: 46,
        });
      state.y += rowH;
    }
    state.y += 8;
    doc.fillColor(NAVY);
  };

  const renderBlock = (block: Block) => {
    switch (block.kind) {
      case 'heading':
        heading(block.text, block.level);
        break;
      case 'paragraph':
        paragraph(block.text);
        break;
      case 'bullets':
        bullets(block.items);
        break;
      case 'kv':
        kv(block.pairs);
        break;
      case 'table':
        table(block.headers, block.rows, block.align);
        break;
      case 'chart':
        chart(block.title, block.data, block.max, block.unit);
        break;
      case 'pagebreak':
        newPage();
        break;
    }
  };

  for (const block of content.blocks) renderBlock(block);

  const logo = brandImage('logo-full.png');
  const logoWidth = logo ? 84 : 0;
  const headerTextX = PAGE_MARGIN + (logo ? logoWidth + 10 : 0);
  const headerTextWidth = (pageW: number) => pageW - PAGE_MARGIN * 2 - (logo ? logoWidth + 10 : 0);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageW = doc.page.width;
    if (logo) doc.image(logo, PAGE_MARGIN, 14, { width: logoWidth });
    doc.font('Helvetica').fontSize(7.5).fillColor(SLATE);
    doc.text(sanitizePdfText(`${content.organization} - ${content.type} report`), headerTextX, 30, {
      width: headerTextWidth(pageW),
      align: 'left',
      lineBreak: false,
    });
    doc.text(sanitizePdfText(`Report ${content.reportKey}`), PAGE_MARGIN, 30, {
      width: pageW - PAGE_MARGIN * 2,
      align: 'right',
      lineBreak: false,
    });
    const footerY = doc.page.height - 38;
    doc
      .strokeColor(LIGHT)
      .lineWidth(0.5)
      .moveTo(PAGE_MARGIN, footerY - 6)
      .lineTo(pageW - PAGE_MARGIN, footerY - 6)
      .stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(SLATE);
    doc.text(
      sanitizePdfText(
        `Confidential - ${content.customer.name} - generated ${content.generatedAt.slice(0, 10)}`,
      ),
      PAGE_MARGIN,
      footerY,
      { width: pageW - PAGE_MARGIN * 2 - 90, align: 'left', lineBreak: false },
    );
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN, footerY, {
      width: pageW - PAGE_MARGIN * 2,
      align: 'right',
      lineBreak: false,
    });
  }

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}
