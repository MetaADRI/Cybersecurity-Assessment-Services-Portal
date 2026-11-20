import PDFDocument from 'pdfkit';
import { ORGANIZATION } from '../../../shared/constants';
import { brandImage } from './brand';
import { FREE_SERVICE_COPY, severityLabel, type FreeResult } from '../../../shared/free-services';
import { sanitizePdfText } from './pdf';

const NAVY = '#081530';
const SLATE = '#51627f';
const LIGHT = '#d5e1f5';
const BLUE = '#0372e5';
const RED = '#b91c1c';
const AMBER = '#b45309';
const GREEN = '#15803d';
const WHITE = '#ffffff';

function severityColor(severity: string): string {
  if (severity === 'high') return RED;
  if (severity === 'medium') return AMBER;
  if (severity === 'low') return SLATE;
  return BLUE;
}

export async function renderFreeReportPdf(input: {
  result: FreeResult;
  target?: string | null;
  clientName?: string | null;
}): Promise<Buffer> {
  const { result } = input;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    bufferPages: true,
    info: {
      Title: sanitizePdfText(
        `OpenDefenders free security check - ${FREE_SERVICE_COPY[result.serviceKey].name}`,
      ),
      Author: ORGANIZATION,
      Creator: 'OpenDefenders',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  const width = doc.page.width - 112;
  const bottom = () => doc.page.height - 70;
  let y = 56;
  const ensure = (height: number) => {
    if (y + height > bottom()) {
      doc.addPage();
      y = 56;
    }
  };
  const text = (value: string, size = 10, color = NAVY, font = 'Helvetica') => {
    doc.font(font).fontSize(size).fillColor(color);
    const clean = sanitizePdfText(value);
    const height = doc.heightOfString(clean, { width, lineGap: 2 });
    ensure(height + 4);
    doc.text(clean, 56, y, { width, lineGap: 2 });
    y = doc.y + 6;
  };
  const heading = (value: string) => {
    y += 8;
    text(value, 14, BLUE, 'Helvetica-Bold');
  };

  doc.rect(0, 0, doc.page.width, 120).fill(NAVY);
  const logo = brandImage('logo-full-reversed.png');
  if (logo) doc.image(logo, 56, 18, { width: 112 });
  doc
    .fillColor(WHITE)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('Free security check report', 56, 76, { width });
  y = 150;

  text(`Prepared for: ${input.clientName || 'Website owner'}`, 10, SLATE);
  text(`Service: ${FREE_SERVICE_COPY[result.serviceKey].name}`, 10, SLATE);
  if (input.target || result.meta?.target) {
    text(`Target: ${input.target || result.meta?.target}`, 10, SLATE);
  }
  text(
    `Generated: ${new Date(result.checkedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })}`,
    10,
    SLATE,
  );

  y += 10;
  doc.roundedRect(56, y, width, 86, 8).fill('#eaf2ff').stroke('#7faeff');
  const scoreWidth = doc.font('Helvetica-Bold').fontSize(34).widthOfString(`${result.score}`);
  doc
    .fillColor(BLUE)
    .font('Helvetica-Bold')
    .fontSize(34)
    .text(`${result.score}`, 78, y + 20);
  doc
    .fillColor(SLATE)
    .font('Helvetica')
    .fontSize(10)
    .text('/ 100', 78 + scoreWidth + 6, y + 36);
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(`Grade ${result.grade}`, 210, y + 18);
  doc
    .fillColor(SLATE)
    .font('Helvetica')
    .fontSize(10)
    .text(sanitizePdfText(result.summary), 210, y + 40, {
      width: width - 180,
      lineGap: 2,
    });
  y += 106;

  heading('What we found');
  if (result.findings.length === 0) {
    text('No findings were recorded by this check.', 10, GREEN);
  }
  for (const finding of result.findings) {
    ensure(130);
    doc.fillColor(severityColor(finding.severity)).font('Helvetica-Bold').fontSize(9);
    doc.text(severityLabel(finding.severity).toUpperCase(), 56, y);
    y = doc.y + 3;
    text(finding.title, 12, NAVY, 'Helvetica-Bold');
    if (finding.detail) text(finding.detail, 9, SLATE);
    text(`What this means: ${finding.meaning}`, 9.5);
    text(`What it could lead to: ${finding.consequence}`, 9.5);
    text(`What we recommend: ${finding.recommendation}`, 9.5, BLUE);
    y += 4;
    doc
      .strokeColor(LIGHT)
      .lineWidth(0.5)
      .moveTo(56, y)
      .lineTo(56 + width, y)
      .stroke();
    y += 8;
  }

  heading('How to read this report');
  text(
    'This was a passive, read-only check. It did not attempt to break in, send phishing messages, fuzz inputs or test internal systems. A clean result does not prove the environment is secure; it means the specific public signals we checked looked reasonable at the time. A weak result is a prompt to fix the basics and consider a deeper, authorised assessment.',
    9.5,
    SLATE,
  );
  text(
    'No scan content from the target was stored. Only the findings above and basic run metadata are kept. This report is confidential to the organisation that requested it.',
    9.5,
    SLATE,
  );

  heading('Need help fixing these?');
  text(
    `${ORGANIZATION} can validate the findings, prioritise the work and help you close the gaps. Create a free client account to request a service, or speak to your OpenDefenders contact.`,
    10,
    NAVY,
  );

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    doc
      .fillColor(SLATE)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `${ORGANIZATION} - Lusaka, Zambia | This is a risk indicator, not a guarantee of security.`,
        56,
        doc.page.height - 42,
        { width, align: 'center' },
      );
    doc.text(`Page ${page + 1} of ${range.count}`, 56, doc.page.height - 30, {
      width,
      align: 'center',
    });
  }

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}
