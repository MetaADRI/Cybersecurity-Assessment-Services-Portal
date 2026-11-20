import net from 'node:net';
import {
  EMAIL_PHISHING_FINDING_COPY,
  FREE_RESULT_SCHEMA_VERSION,
  findingPenalty,
  gradeForScore,
  resultSummary,
  type EmailPhishingLinkMeta,
  type EmailPhishingMeta,
  type FreeFinding,
  type FreeResult,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'short.link',
  'cutt.ly',
  'rebrand.ly',
  's.id',
]);

const BRAND_TERMS = [
  'paypal',
  'microsoft',
  'google',
  'apple',
  'amazon',
  'facebook',
  'whatsapp',
  'instagram',
  'bank',
  'absa',
  'stanbic',
  'zamtel',
  'airtel',
  'mtn',
  'security',
  'support',
  'billing',
  'accounts',
  'invoice',
  'admin',
];

const URGENCY_PATTERNS = [
  /\burgent\b/i,
  /\bact now\b/i,
  /\bimmediately\b/i,
  /\bfinal notice\b/i,
  /\bverify (?:your )?account\b/i,
  /\bsuspend(?:ed|suspension)?\b/i,
  /\bwithin \d+ (?:hours?|minutes?)\b/i,
  /\blast chance\b/i,
];

const CREDENTIAL_PATTERNS = [
  /\bpassword\b/i,
  /\bone[- ]time (?:code|password)\b/i,
  /\botp\b/i,
  /\bmfa code\b/i,
  /\bverification code\b/i,
  /\bpin\b/i,
  /\bcredentials?\b/i,
  /\blogin details\b/i,
  /\brecovery phrase\b/i,
];

const PAYMENT_PATTERNS = [
  /\bbank details\b/i,
  /\bpayment\b/i,
  /\binvoice\b/i,
  /\btransfer\b/i,
  /\bmobile money\b/i,
  /\bgift card\b/i,
  /\bwallet\b/i,
  /\bfees?\b/i,
];

const DOCUMENT_PATTERNS = [
  /\binvoice\b/i,
  /\bstatement\b/i,
  /\bshared document\b/i,
  /\breceipt\b/i,
  /\bcontract\b/i,
];

const AUTH_STATUSES = '(pass|fail|softfail|neutral|none|temperror|permerror|policy)';

function addFinding(findings: FreeFinding[], id: string, detail?: string): void {
  const copy = EMAIL_PHISHING_FINDING_COPY[id];
  if (!copy) return;
  findings.push({ id, ...copy, ...(detail ? { detail } : {}) });
}

function headerValue(text: string, name: string): string | null {
  const match = new RegExp(`^${name}:[ \\t]*(.+)$`, 'im').exec(text);
  return match?.[1]?.trim() ?? null;
}

function domainFromAddress(value: string | null): string | null {
  if (!value) return null;
  const bracketed = /<([^>]+)>/.exec(value)?.[1] ?? value;
  const address = bracketed.split(',')[0]?.trim() ?? '';
  const at = address.lastIndexOf('@');
  if (at < 0) return null;
  const domain = address.slice(at + 1).replace(/[>);,'"]/g, '').toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
}

function displayName(value: string | null): string {
  if (!value) return '';
  const bracket = /^\s*"?([^<]+?)"?\s*</.exec(value)?.[1];
  return (bracket ?? value.split('@')[0] ?? '').trim();
}

function authStatus(text: string, mechanism: 'spf' | 'dkim' | 'dmarc'): string | null {
  const pattern = new RegExp(`\\b${mechanism}\\s*=\\s*${AUTH_STATUSES}`, 'i');
  return pattern.exec(text)?.[1]?.toLowerCase() ?? null;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches.map((value) => value.replace(/[),.;]+$/, '')))].slice(0, 50);
}

function linkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function analyseLinks(urls: string[]): EmailPhishingLinkMeta[] {
  const hosts: EmailPhishingLinkMeta[] = [];
  for (const url of urls) {
    const host = linkHost(url);
    if (!host) continue;
    let reason: string | null = null;
    if (net.isIP(host)) reason = 'Direct IP address';
    else if (SHORTENERS.has(host)) reason = 'URL shortening service';
    else if (host.includes('xn--') || /[\u0080-\uffff]/.test(host)) reason = 'Encoded or unusual characters';
    if (reason && !hosts.some((item) => item.host === host && item.reason === reason)) {
      hosts.push({ host, reason });
    }
  }
  return hosts.slice(0, 10);
}

function anyMatch(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export async function runEmailPhishingCheck(input: { target: string }): Promise<FreeResult> {
  const raw = input.target.trim();
  if (raw.length < 40) {
    throw new ValidationError('Paste the full suspicious email text or headers to analyse');
  }
  if (raw.length > 20_000) {
    throw new ValidationError('That email is too long to analyse in the free check');
  }

  const findings: FreeFinding[] = [];
  const subject = headerValue(raw, 'subject')?.slice(0, 160) ?? null;
  const from = headerValue(raw, 'from');
  const replyTo = headerValue(raw, 'reply-to');
  const senderDomain = domainFromAddress(from);
  const replyToDomain = domainFromAddress(replyTo);
  const senderName = displayName(from);

  const authenticationResults = headerValue(raw, 'authentication-results') ?? '';
  const receivedSpf = headerValue(raw, 'received-spf');
  const spf = authStatus(authenticationResults, 'spf') ?? receivedSpf?.split(';')[0]?.trim().toLowerCase() ?? null;
  const dkim = authStatus(authenticationResults, 'dkim');
  const dmarc = authStatus(authenticationResults, 'dmarc');

  const urls = extractUrls(raw);
  const riskyLinks = analyseLinks(urls);
  const shortenedLinks = riskyLinks.filter((link) => link.reason === 'URL shortening service');
  const ipLinks = riskyLinks.filter((link) => link.reason === 'Direct IP address');
  const punycodeLinks = riskyLinks.filter(
    (link) => link.reason === 'Encoded or unusual characters',
  );

  const senderBrandTerms = BRAND_TERMS.filter(
    (term) =>
      senderName.toLowerCase().includes(term) &&
      (!senderDomain || !senderDomain.includes(term.replace(/\s+/g, ''))),
  );

  const hasUrgency = anyMatch(URGENCY_PATTERNS, raw);
  const hasCredentialRequest = anyMatch(CREDENTIAL_PATTERNS, raw);
  const hasPaymentRequest = anyMatch(PAYMENT_PATTERNS, raw);
  const hasDocumentKeyword = anyMatch(DOCUMENT_PATTERNS, raw);
  const hasGenericGreeting = /dear (?:user|customer|client|colleague|sir|madam)|hello (?:there|user)/i.test(
    raw,
  );

  if (senderBrandTerms.length > 0) {
    addFinding(
      findings,
      'emailphish.sender_mismatch',
      `Display name mentions ${senderBrandTerms.slice(0, 3).join(', ')}; sender domain is ${senderDomain ?? 'unknown'}.`,
    );
  }
  if (replyToDomain && senderDomain && replyToDomain !== senderDomain) {
    addFinding(
      findings,
      'emailphish.reply_to_mismatch',
      `Sender: ${senderDomain}; replies: ${replyToDomain}.`,
    );
  }

  if (spf && spf !== 'pass' && spf !== 'none') addFinding(findings, 'emailphish.spf_fail', `SPF: ${spf}`);
  if (dkim && dkim !== 'pass' && dkim !== 'none') addFinding(findings, 'emailphish.dkim_fail', `DKIM: ${dkim}`);
  if (dmarc && dmarc !== 'pass' && dmarc !== 'none') addFinding(findings, 'emailphish.dmarc_fail', `DMARC: ${dmarc}`);
  if (!spf && !dkim && !dmarc) addFinding(findings, 'emailphish.auth_missing');

  if (hasCredentialRequest) addFinding(findings, 'emailphish.credential_request');
  if (hasPaymentRequest && hasUrgency) addFinding(findings, 'emailphish.payment_request');
  if (hasUrgency) addFinding(findings, 'emailphish.urgent_language');
  if (hasGenericGreeting) addFinding(findings, 'emailphish.generic_greeting');
  if (shortenedLinks.length > 0) {
    addFinding(
      findings,
      'emailphish.shortened_links',
      shortenedLinks.map((link) => link.host).join(', '),
    );
  }
  if (ipLinks.length > 0) {
    addFinding(findings, 'emailphish.ip_links', ipLinks.map((link) => link.host).join(', '));
  }
  if (punycodeLinks.length > 0) {
    addFinding(
      findings,
      'emailphish.punycode_links',
      punycodeLinks.map((link) => link.host).join(', '),
    );
  }
  if (urls.length >= 4) addFinding(findings, 'emailphish.many_links', `${urls.length} links found`);
  if (hasDocumentKeyword) addFinding(findings, 'emailphish.attachment_keyword');
  if (raw.length < 160) addFinding(findings, 'emailphish.limited_content');
  if (!findings.some((finding) => finding.severity !== 'info')) {
    addFinding(findings, 'emailphish.no_obvious_signals');
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.max(
    0,
    100 - findings.reduce((total, item) => total + findingPenalty(item.severity), 0),
  );

  const signals: string[] = [];
  if (senderBrandTerms.length > 0) signals.push('Sender name mismatch');
  if (replyToDomain && senderDomain && replyToDomain !== senderDomain) signals.push('Reply-To mismatch');
  if (spf) signals.push(`SPF ${spf}`);
  if (dkim) signals.push(`DKIM ${dkim}`);
  if (dmarc) signals.push(`DMARC ${dmarc}`);
  if (hasCredentialRequest) signals.push('Credential request');
  if (hasPaymentRequest && hasUrgency) signals.push('Urgent payment change');
  if (hasUrgency) signals.push('Urgent language');
  if (shortenedLinks.length > 0) signals.push('Shortened links');
  if (ipLinks.length > 0) signals.push('Direct IP links');
  if (punycodeLinks.length > 0) signals.push('Encoded link hosts');

  const emailPhishing: EmailPhishingMeta = {
    senderDomain,
    replyToDomain,
    subject,
    auth: { spf, dkim, dmarc },
    signals,
    links: riskyLinks,
    linkCount: urls.length,
    bodyChars: raw.length,
    checksRun: 10,
  };

  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'email_phishing_check',
    score,
    grade: gradeForScore(score),
    summary: resultSummary(score, findings),
    findings,
    checkedAt: new Date().toISOString(),
    meta: {
      target: 'Pasted email analysis',
      checksRun: emailPhishing.checksRun,
      emailPhishing,
    },
  };
}
