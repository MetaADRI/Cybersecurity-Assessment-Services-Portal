import dns from 'node:dns';
import {
  EMAIL_FINDING_COPY,
  FREE_RESULT_SCHEMA_VERSION,
  findingPenalty,
  gradeForScore,
  resultSummary,
  type EmailMeta,
  type EmailSpfMeta,
  type FreeFinding,
  type FreeResult,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 'mail', 's1', 's2'];

function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  value = value.split('/')[0] ?? value;
  if (value.includes('@')) value = value.split('@').pop() ?? value;
  value = value.replace(/^\.+|\.+$/g, '');
  if (!value || value.length > 253) throw new ValidationError('Enter a valid email domain');
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)) {
    throw new ValidationError('Enter a valid email domain, for example yourcompany.com');
  }
  return value;
}

async function txt(name: string): Promise<string[]> {
  try {
    const records = await dns.promises.resolveTxt(name);
    return records.map((parts) => parts.join('')).filter(Boolean);
  } catch {
    return [];
  }
}

function addFinding(findings: FreeFinding[], id: string, detail?: string): void {
  const copy = EMAIL_FINDING_COPY[id];
  if (!copy) return;
  findings.push({ id, ...copy, ...(detail ? { detail } : {}) });
}

function detectMxProvider(mx: { exchange: string }[]): string | null {
  for (const entry of mx) {
    const host = entry.exchange.split(':')[1]?.toLowerCase() ?? '';
    if (host.includes('googlemail') || host.includes('google')) return 'Google Workspace';
    if (
      host.includes('microsoft') ||
      host.includes('office365') ||
      host.includes('mx.protection')
    ) {
      return 'Microsoft 365';
    }
    if (host.includes('yahoo')) return 'Yahoo Mail';
    if (host.includes('zoho')) return 'Zoho Mail';
  }
  return null;
}

function spfQualifier(spf: string | null): '+' | '~' | '?' | '-' | null {
  if (!spf) return null;
  if (/~all/i.test(spf)) return '~';
  if (/\?all/i.test(spf)) return '?';
  if (/\+all/i.test(spf)) return '+';
  if (/^-all/i.test(spf)) return '-';
  return null;
}

export async function runEmailCheck(input: {
  target: string;
  consentConfirmed: boolean;
}): Promise<FreeResult> {
  if (!input.consentConfirmed) {
    throw new ValidationError('Confirm that you own the domain or are authorised to test it');
  }
  const domain = normalizeDomain(input.target);
  const findings: FreeFinding[] = [];

  let mx: dns.MxRecord[] = [];
  try {
    mx = await dns.promises.resolveMx(domain);
  } catch {
    mx = [];
  }

  const rootTxt = await txt(domain);
  const spfRecords = rootTxt.filter((r) => /^v=spf1\b/i.test(r));
  const spf = spfRecords[0] ?? null;
  const spfQualifierValue = spfQualifier(spf);

  const spfMeta: EmailSpfMeta = {
    record: spf,
    recordCount: spfRecords.length,
    lookupCount: spf ? spf.split(/\s+/).filter((m) => m && !/^v=spf1/i.test(m)).length : 0,
    qualifier: spfQualifierValue,
    mechanisms: spf ? spf.split(/\s+/).filter((m) => m && !/^v=spf1/i.test(m)) : [],
    includes: spf
      ? spf
          .split(/\s+/)
          .filter((m) => m.startsWith('include:'))
          .map((m) => m)
      : [],
    tooManyLookups: false,
  };

  const dmarcTxt = await txt(`_dmarc.${domain}`);
  const dmarc = dmarcTxt.find((r) => /^v=DMARC1\b/i.test(r)) ?? null;
  const dmarcPolicy: 'none' | 'quarantine' | 'reject' | null = dmarc
    ? ((/p\s*=\s*(none|quarantine|reject)\b/i.exec(dmarc)?.[1]?.toLowerCase() as
        'none' | 'quarantine' | 'reject') ?? null)
    : null;

  const dkimSelectors = await Promise.all(
    DKIM_SELECTORS.map(async (selector) => {
      const records = await txt(`${selector}._domainkey.${domain}`);
      const found = records.some((r) => /v=DKIM1|k=rsa|p=/i.test(r));
      return { selector, found, record: found ? (records[0] ?? null) : null };
    }),
  );
  const dkimFound = dkimSelectors.some((d) => d.found);

  const mtaStsTxt = await txt(`_mta-sts.${domain}`);
  const mtaSts = mtaStsTxt.length > 0;
  const tlsRptTxt = await txt(`_tlsrpt.${domain}`);
  const tlsRpt = tlsRptTxt.length > 0;
  const bimiTxt = await txt(`default._bimi.${domain}`);
  const bimi = bimiTxt.length > 0;

  const mxProvider = detectMxProvider(mx);

  const spfOk =
    !!spf && spfQualifier(spf) !== '~' && spfQualifier(spf) !== '?' && spfQualifier(spf) !== '+';
  const dmarcOk = dmarcPolicy === 'quarantine' || dmarcPolicy === 'reject';

  if (mx.length === 0 && rootTxt.length === 0 && dmarcTxt.length === 0) {
    addFinding(findings, 'email.dns_failed');
  } else if (mx.length === 0) {
    addFinding(findings, 'email.mx_missing');
  }

  if (!spfOk) {
    addFinding(findings, 'email.spf_missing');
  }

  if (!dmarc) {
    addFinding(findings, 'email.dmarc_missing');
  } else if (dmarcPolicy === 'none') {
    addFinding(findings, 'email.dmarc_weak', 'p=none');
  }

  if (!dkimFound) {
    addFinding(findings, 'email.dkim_not_detected');
  }

  if (!mtaSts) addFinding(findings, 'email.mta_sts_missing');
  if (!tlsRpt) addFinding(findings, 'email.tls_rpt_missing');
  if (!bimi) addFinding(findings, 'email.bimi_missing');

  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.max(
    0,
    100 - findings.reduce((total, item) => total + findingPenalty(item.severity), 0),
  );

  const shieldChecks = [
    { key: 'spf', active: spfOk, label: 'SPF authorising sending domains' },
    { key: 'dkim', active: dkimFound, label: 'DKIM signing' },
    { key: 'dmarc', active: dmarcOk, label: 'DMARC enforcement' },
    { key: 'mta_sts', active: mtaSts, label: 'MTA-STS transport security' },
    { key: 'tls_rpt', active: tlsRpt, label: 'TLS-RPT reporting' },
    { key: 'bimi', active: bimi, label: 'BIMI brand identity' },
  ];
  const shield = {
    active: shieldChecks.filter((c) => c.active).length,
    total: shieldChecks.length,
  };

  const spoofing = {
    likelihood: (spfOk && dkimFound && dmarcOk ? 'unlikely' : dmarcOk ? 'possible' : 'likely') as
      'unlikely' | 'possible' | 'likely',
    summary:
      dmarcOk && spfOk && dkimFound
        ? 'Strong defences. Spoofed senders are unlikely to be delivered.'
        : dmarcPolicy === 'quarantine'
          ? 'Moderate defences. Suspicious senders may land in spam quarantine first.'
          : 'Defences are still maturing. Spoofed senders may still be delivered.',
    steps: [
      'Resolve SPF to see which senders are authorised.',
      'Check DKIM signatures for the selectors in use.',
      'Read DMARC policy to judge enforcement level.',
      'Use MTA-STS, TLS-RPT and BIMI context to complete the picture.',
    ],
  };

  const email: EmailMeta = {
    domain,
    mx: mx.map((m) => m.exchange),
    mxProvider,
    spf: spfMeta,
    dmarc: {
      record: dmarc,
      policy: dmarcPolicy,
      subdomainPolicy: dmarcPolicy,
      pct: null,
      rua: [],
      ruf: [],
    },
    dkimSelectors,
    mtaSts,
    mtaStsRecord: mtaSts ? mtaStsTxt.join(' ') : null,
    tlsRpt,
    tlsRptRecord: tlsRpt ? tlsRptTxt.join(' ') : null,
    bimi,
    bimiRecord: bimi ? bimiTxt.join(' ') : null,
    shieldActive: shield.active,
    shieldTotal: shield.total,
    spoofing,
  };

  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'email_check',
    score,
    grade: gradeForScore(score),
    summary: resultSummary(score, findings),
    findings,
    checkedAt: new Date().toISOString(),
    meta: { target: domain, email, checksRun: 7 },
  };
}
