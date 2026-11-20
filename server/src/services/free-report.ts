import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../database/db';
import type { Env } from '../config/env';
import { newId } from '../utils/time';
import { ValidationError } from '../utils/errors';
import { getFreeRunForVisitor } from '../repositories/free-runs';
import { createClientReport } from '../repositories/client-reports';
import { renderFreeReportPdf } from '../reports/free-report';
import { logger } from '../utils/logger';

export function resolveFreeReportPath(env: Env, fileName: string): string {
  if (!/^FREE-[a-f0-9-]{36}\.pdf$/i.test(fileName)) {
    throw new ValidationError('Invalid report file reference');
  }
  const dir = path.resolve(process.cwd(), env.REPORTS_DIR, 'free');
  const full = path.resolve(dir, fileName);
  if (!full.startsWith(dir + path.sep)) {
    throw new ValidationError('Invalid report file reference');
  }
  return full;
}

export async function generateFreeReport(
  db: Db,
  env: Env,
  input: { runId: string; visitorId: string; clientId: string | null; clientName?: string | null },
): Promise<{ id: string; fileName: string }> {
  const run = await getFreeRunForVisitor(db, input.runId, input.visitorId);
  if (!run || run.status !== 'completed' || !run.result) {
    throw new ValidationError('That result is not ready for a report yet');
  }

  const pdf = await renderFreeReportPdf({
    result: run.result,
    target: run.target,
    clientName: input.clientName ?? null,
  });
  const fileName = `FREE-${newId()}.pdf`;
  const dir = path.resolve(process.cwd(), env.REPORTS_DIR, 'free');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveFreeReportPath(env, fileName), pdf);
  try {
    return await createClientReport(db, {
      clientId: input.clientId,
      visitorId: input.visitorId,
      freeServiceRunId: input.runId,
      pdfPath: fileName,
    });
  } catch (err) {
    logger.warn('Free report row could not be saved; file will be orphaned', {
      runId: input.runId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
