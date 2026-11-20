import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import type { TLSSocket } from 'node:tls';
import {
  FREE_RESULT_SCHEMA_VERSION,
  WEBSITE_FINDING_COPY,
  findingPenalty,
  gradeForScore,
  resultSummary,
  type FreeFinding,
  type FreeGrade,
  type FreeResult,
  type WebsiteHeaderMeta,
  type WebsiteMeta,
  type WebsiteTlsMeta,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

const USER_AGENT = 'OpenDefenders-FreeCheck/1.0';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 64 * 1024;
const RDAP_TIMEOUT_MS = 8000;

interface ResolvedTarget {
  url: URL;
  address: string;
  family: number;
}

interface FetchResult {
  url: URL;
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
  tls: WebsiteTlsMeta | null;
  redirects: URL[];
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isBlockedAddress(address: string): boolean {
  let value = address.trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  const family = net.isIP(value);
  if (family === 4) {
    return BLOCKED_V4.some(([base, bits]) => inV4Range(value, base, bits));
  }
  if (family === 6) {
    if (value === '::' || value === '::1') return true;
    if (
      value.startsWith('fe8') ||
      value.startsWith('fe9') ||
      value.startsWith('fea') ||
      value.startsWith('feb')
    ) {
      return true;
    }
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('ff')) return true;
    if (value.startsWith('2001:db8')) return true;
    return false;
  }
  return true;
}

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function inV4Range(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(address) & mask) === (ipv4ToInt(base) & mask);
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

async function resolveTarget(url: URL): Promise<ResolvedTarget> {
  const hostname = hostnameOf(url);
  const literal = net.isIP(hostname);
  if (literal) {
    if (isBlockedAddress(hostname)) {
      throw new ValidationError('That address is not a public internet host');
    }
    return { url, address: hostname, family: literal };
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ValidationError('The domain name could not be resolved');
  }
  if (addresses.length === 0) {
    throw new ValidationError('The domain name could not be resolved');
  }
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new ValidationError('That address is not a public internet host');
  }
  const first = addresses[0];
  return { url, address: first.address, family: first.family };
}

export async function validateTargetUrl(input: string): Promise<ResolvedTarget> {
  const raw = input.trim();
  if (!raw) throw new ValidationError('Enter a website address');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ValidationError('Enter a valid website address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http and https addresses are supported');
  }
  if (url.username || url.password) {
    throw new ValidationError('Addresses containing credentials are not supported');
  }
  if (url.hostname.length === 0 || url.hostname.length > 253) {
    throw new ValidationError('Enter a valid website address');
  }
  const standardPort =
    (url.protocol === 'http:' && (url.port === '' || url.port === '80')) ||
    (url.protocol === 'https:' && (url.port === '' || url.port === '443'));
  if (!standardPort) {
    throw new ValidationError('Only standard HTTP and HTTPS ports are supported');
  }
  url.hash = '';
  return resolveTarget(url);
}

function certificateName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const commonName = record.CN;
  if (typeof commonName === 'string') return commonName;
  const organisation = record.O;
  return typeof organisation === 'string' ? organisation : null;
}

function requestOnce(target: ResolvedTarget): Promise<FetchResult> {
  const { url, address, family } = target;
  const isHttps = url.protocol === 'https:';
  const hostname = hostnameOf(url);

  const tls: WebsiteTlsMeta = {
    authorized: true,
    authorizationError: null,
    issuer: null,
    subject: null,
    validFrom: null,
    validTo: null,
    daysRemaining: null,
    protocol: null,
    acceptedProtocols: [],
    keyType: null,
    keySize: null,
    chainValid: null,
    hostnameMatch: null,
  };

  const options: https.RequestOptions = {
    host: address,
    family,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname || '/'}${url.search}`,
    method: 'GET',
    headers: {
      Host: hostname,
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'identity',
    },
    servername: isHttps && net.isIP(hostname) === 0 ? hostname : undefined,
    rejectUnauthorized: false,
    agent: false,
    timeout: REQUEST_TIMEOUT_MS,
  };

  return new Promise<FetchResult>((resolve, reject) => {
    let settled = false;
    const finish = (value: FetchResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      const socket = res.socket as TLSSocket;
      if (isHttps && typeof socket.getPeerCertificate === 'function') {
        const cert = socket.getPeerCertificate();
        tls.authorized = Boolean(socket.authorized);
        tls.authorizationError = socket.authorizationError
          ? String(socket.authorizationError)
          : null;
        tls.validTo = cert?.valid_to ?? null;
        tls.validFrom = cert?.valid_from ?? null;
        tls.protocol = socket.getProtocol?.() ?? null;
        const keyInfo = cert as unknown as {
          keyType?: string | null;
          keySize?: number | null;
        } | null;
        tls.keyType = keyInfo?.keyType ?? null;
        tls.keySize = keyInfo?.keySize ?? null;

        if (tls.validTo) {
          const expiry = Date.parse(tls.validTo);
          if (!Number.isNaN(expiry)) {
            tls.daysRemaining = Math.floor((expiry - Date.now()) / 86_400_000);
          }
        }
        const subject = certificateName(cert?.subject);
        const issuer = certificateName(cert?.issuer);
        tls.subject = subject ?? null;
        tls.issuer = issuer ?? null;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      const complete = () =>
        finish({
          url,
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          tls,
          redirects: [],
        });

      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) res.destroy();
        else chunks.push(chunk);
      });
      res.on('end', complete);
      res.on('close', complete);
      res.on('error', fail);
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('The request timed out')));
    req.on('error', fail);
    req.end();
  });
}

async function fetchFollow(input: URL): Promise<FetchResult> {
  let target = await resolveTarget(input);
  const redirects: URL[] = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(target);
    const location = response.headers.location;
    if (
      response.status >= 300 &&
      response.status < 400 &&
      typeof location === 'string' &&
      hop < MAX_REDIRECTS
    ) {
      let next: URL;
      try {
        next = new URL(location, response.url);
      } catch {
        throw new ValidationError('The website returned an invalid redirect');
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new ValidationError('The website redirected to an unsupported protocol');
      }
      if (
        (next.protocol === 'http:' && next.port && next.port !== '80') ||
        (next.protocol === 'https:' && next.port && next.port !== '443')
      ) {
        throw new ValidationError('The website redirected to a non-standard port');
      }
      redirects.push(next);
      target = await resolveTarget(next);
      continue;
    }
    return { ...response, redirects };
  }
  throw new ValidationError('The website redirected too many times');
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const raw = headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw.join(', ');
  return typeof raw === 'string' ? raw : null;
}

function addFinding(findings: FreeFinding[], id: string, detail?: string): void {
  const copy = WEBSITE_FINDING_COPY[id];
  if (!copy) return;
  findings.push({ id, ...copy, ...(detail ? { detail } : {}) });
}

function scoreFindings(findings: FreeFinding[]): number {
  return Math.max(
    0,
    100 - findings.reduce((total, item) => total + findingPenalty(item.severity), 0),
  );
}

function httpsUrlFor(url: URL): URL {
  const next = new URL(url.toString());
  next.protocol = 'https:';
  next.port = '';
  return next;
}

function httpUrlFor(url: URL): URL {
  const next = new URL(url.toString());
  next.protocol = 'http:';
  next.port = '';
  return next;
}

function checkTls(tls: WebsiteTlsMeta | null, findings: FreeFinding[]): void {
  if (!tls) return;
  if (!tls.authorized) {
    addFinding(findings, 'web.tls_invalid', tls.authorizationError ?? undefined);
  } else if (tls.validTo) {
    const expiry = Date.parse(tls.validTo);
    if (!Number.isNaN(expiry)) {
      const days = Math.floor((expiry - Date.now()) / 86_400_000);
      if (days < 0) addFinding(findings, 'web.tls_expired');
      else if (days <= 30) addFinding(findings, 'web.tls_expiring', `${days} day(s) remaining`);
    }
  }
  if (tls.protocol && tls.protocol !== 'TLSv1.2' && tls.protocol !== 'TLSv1.3') {
    addFinding(findings, 'web.tls_protocol', tls.protocol);
  }
}

function checkHeaders(
  headers: IncomingHttpHeaders,
  findings: FreeFinding[],
): { grade: FreeGrade; headers: WebsiteHeaderMeta[] } {
  const allHeaders = [
    'strict-transport-security',
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
  ];
  const details: WebsiteHeaderMeta[] = [];
  let score = 100;

  for (const name of allHeaders) {
    const value = header(headers, name);
    details.push({ name, present: !!value, value: value ?? null });
    if (!value) {
      score -= score <= 20 ? 0 : 15;
    }
  }

  const hsts = header(headers, 'strict-transport-security');
  const hstsMaxAge = hsts ? Number(/max-age\s*=\s*(\d+)/i.exec(hsts)?.[1] ?? 0) : 0;
  if (!hsts || hstsMaxAge === 0) {
    addFinding(findings, 'web.hsts_missing', hsts ? 'HSTS max-age is zero' : undefined);
  } else if (hstsMaxAge < 15_552_000) {
    addFinding(findings, 'web.hsts_short', `max-age=${hstsMaxAge} seconds`);
  }

  const csp = header(headers, 'content-security-policy');
  if (!csp) addFinding(findings, 'web.csp_missing');

  const frameOptions = header(headers, 'x-frame-options');
  const cspFrames = csp ? /frame-ancestors\b/i.test(csp) : false;
  if (!frameOptions && !cspFrames) addFinding(findings, 'web.frame_missing');

  if (!header(headers, 'x-content-type-options')) {
    addFinding(findings, 'web.nosniff_missing');
  }
  if (!header(headers, 'referrer-policy')) {
    addFinding(findings, 'web.referrer_missing');
  }
  if (!header(headers, 'permissions-policy')) {
    addFinding(findings, 'web.permissions_missing');
  }

  const poweredBy = header(headers, 'x-powered-by');
  const server = header(headers, 'server');
  details.push({ name: 'x-powered-by', present: !!poweredBy, value: poweredBy ?? null });
  details.push({ name: 'server', present: !!server, value: server ?? null });
  if (poweredBy || server) {
    score -= 10;
    const disclosed = [poweredBy, server].filter(Boolean).join('; ');
    addFinding(findings, 'web.tech_disclosure', disclosed);
  }

  return { grade: gradeForScore(score), headers: details };
}

function checkCookies(
  headers: IncomingHttpHeaders,
  findings: FreeFinding[],
): { total: number; weak: number } {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const total = cookies.length;
  if (total === 0) {
    addFinding(findings, 'web.cookies_none');
    return { total: 0, weak: 0 };
  }
  const weak = cookies.filter((cookie) => {
    const secure = /;\s*secure\b/i.test(cookie);
    const httpOnly = /;\s*httponly\b/i.test(cookie);
    const sameSite = /;\s*samesite\s*=\s*(lax|strict|none)\b/i.test(cookie);
    return !secure || !httpOnly || !sameSite;
  });
  if (weak.length > 0) {
    addFinding(findings, 'web.cookie_flags', `${weak.length} of ${total} cookie(s) need attention`);
  }
  return { total, weak: weak.length };
}

async function rdapInfo(domain: string): Promise<WebsiteMeta['domain']> {
  const fallback: WebsiteMeta['domain'] = {
    registrar: null,
    createdDate: null,
    ageDays: null,
    expiryDate: null,
    rdapAvailable: false,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timer);
      if (!res.ok) return fallback;
      const data = await res.json();
      const entities: Record<string, unknown>[] = Array.isArray(data.entities) ? data.entities : [];
      let registrar: string | null = null;
      for (const ent of entities) {
        const roles: string[] = Array.isArray(ent.roles) ? ent.roles : [];
        if (roles.includes('registrar')) {
          const vcard = Array.isArray(ent.vcardArray) ? ent.vcardArray[1] : [];
          for (const entry of vcard) {
            if (Array.isArray(entry) && entry[0] === 'fn') {
              const name = Array.isArray(entry[3]) ? entry[3][0] : entry[3];
              registrar = typeof name === 'string' ? name : null;
            }
          }
        }
      }
      const created = data.events?.find(
        (e: { eventAction?: string }) => e.eventAction === 'registration',
      )?.eventDate as string | undefined;
      const expires = data.events?.find(
        (e: { eventAction?: string }) => e.eventAction === 'expiration',
      )?.eventDate as string | undefined;
      let ageDays: number | null = null;
      if (created) {
        const createdMs = Date.parse(created);
        if (!Number.isNaN(createdMs)) {
          ageDays = Math.floor((Date.now() - createdMs) / 86_400_000);
        }
      }
      return {
        registrar,
        createdDate: created ?? null,
        expiryDate: expires ?? null,
        ageDays,
        rdapAvailable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return fallback;
  }
}

function detectTechnologies(body: string, headers: IncomingHttpHeaders): string[] {
  const clues: string[] = [];
  const server = header(headers, 'server');
  if (server) clues.push(`Server header: ${server}`);
  const poweredBy = header(headers, 'x-powered-by');
  if (poweredBy) clues.push(`X-Powered-By: ${poweredBy}`);
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(body);
  if (generator?.[1]) clues.push(`Generator meta: ${generator[1]}`);
  if (/wp-content|wp-includes|wordpress/i.test(body)) clues.push('WordPress markers detected');
  if (/drupal/i.test(body)) clues.push('Drupal markers detected');
  if (/joomla/i.test(body)) clues.push('Joomla markers detected');
  if (/myshopify|shopify/i.test(body)) clues.push('Shopify markers detected');
  return clues;
}

function findMixedContent(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/https?:\/\/[^"'\s]+/gi)) {
    const u = match[0];
    if (u.startsWith('http://')) found.push(u.slice(0, 120));
    if (found.length >= 10) break;
  }
  return found;
}

function findScriptsWithoutIntegrity(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1];
    if (/^https?:\/\//i.test(src) && !/integrity\s*=/i.test(match[0])) {
      found.push(src.slice(0, 120));
    }
    if (found.length >= 10) break;
  }
  return found;
}

function buildInvestigatorClues(
  tls: WebsiteTlsMeta | null,
  domain: string,
  technologies: string[],
  serverHeader: string | null,
): string[] {
  const clues: string[] = [];
  if (serverHeader) clues.push(`Server header advertises: ${serverHeader}`);
  if (tls?.issuer) clues.push(`Certificate issued by: ${tls.issuer}`);
  if (tls?.subject) clues.push(`Certificate subject: ${tls.subject}`);
  if (tls?.daysRemaining !== null && tls?.daysRemaining !== undefined) {
    clues.push(`Certificate expires in ${tls.daysRemaining} day(s)`);
  }
  if (tls?.protocol) clues.push(`Negotiated TLS: ${tls.protocol}`);
  clues.push(`Domain visible in public DNS: ${domain}`);
  if (technologies.length > 0) {
    clues.push(`Technology clues: ${technologies.slice(0, 5).join(', ')}`);
  }
  return clues;
}

export async function runWebsiteCheck(input: {
  target: string;
  consentConfirmed: boolean;
}): Promise<FreeResult> {
  if (!input.consentConfirmed) {
    throw new ValidationError('Confirm that you own the target or are authorised to test it');
  }

  const original = await validateTargetUrl(input.target);
  const findings: FreeFinding[] = [];
  let https: FetchResult | null = null;
  let http: FetchResult | null = null;

  try {
    https = await fetchFollow(httpsUrlFor(original.url));
  } catch {
    https = null;
  }

  let rdap: WebsiteMeta['domain'] | null = null;
  if (https) {
    rdap = await rdapInfo(https.url.hostname);
  }

  if (!https) {
    addFinding(findings, 'web.https_unavailable');
    try {
      http = await fetchFollow(httpUrlFor(original.url));
    } catch {
      addFinding(findings, 'web.unreachable');
    }
  }

  const finalFetch = https ?? http;
  const finalTls = finalFetch?.tls ?? null;

  if (https) {
    checkTls(https.tls, findings);
    const cookies = checkCookies(https.headers, findings);

    try {
      const httpResult = await fetchFollow(httpUrlFor(original.url));
      const redirected =
        httpResult.redirects.some((u) => u.protocol === 'https:') ||
        httpResult.url.protocol === 'https:';
      if (!redirected) addFinding(findings, 'web.no_https_redirect');
    } catch {
      addFinding(findings, 'web.no_https_redirect');
    }

    let securityTxt = false;
    try {
      const securityTxtUrl = new URL('/.well-known/security.txt', https.url);
      const securityTxtResult = await fetchFollow(securityTxtUrl);
      if (
        securityTxtResult.status >= 200 &&
        securityTxtResult.status < 300 &&
        securityTxtResult.body.trim()
      ) {
        securityTxt = true;
        addFinding(findings, 'web.security_txt_present');
      } else {
        addFinding(findings, 'web.security_txt_missing');
      }
    } catch {
      addFinding(findings, 'web.security_txt_missing');
    }

    const mixedContent = findMixedContent(https.body);
    if (mixedContent.length > 0) {
      addFinding(findings, 'web.mixed_content', mixedContent.join('; '));
    }

    const scriptsWithoutIntegrity = findScriptsWithoutIntegrity(https.body);
    if (scriptsWithoutIntegrity.length > 0) {
      addFinding(findings, 'web.script_integrity', scriptsWithoutIntegrity.join('; '));
    }

    const technologies = detectTechnologies(https.body, https.headers);
    const caaPresent = await dns.promises
      .resolveCaa(https.url.hostname)
      .then(() => true)
      .catch(() => false);
    if (!caaPresent) {
      addFinding(findings, 'web.caa_missing');
    }

    const headerResult = checkHeaders(https.headers, findings);

    const investigatorClues = buildInvestigatorClues(
      https.tls,
      https.url.hostname,
      technologies,
      header(https.headers, 'server'),
    );

    const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    const score = scoreFindings(findings);

    const finalUrl = https.url;
    const tlsMeta = finalTls;

    return {
      schemaVersion: FREE_RESULT_SCHEMA_VERSION,
      serviceKey: 'website_check',
      score,
      grade: gradeForScore(score),
      summary: resultSummary(score, findings),
      findings,
      checkedAt: new Date().toISOString(),
      meta: {
        target: finalUrl.toString(),
        httpStatus: finalFetch?.status ?? null,
        checksRun: 11,
        website: {
          finalUrl: finalUrl.toString(),
          httpStatus: finalFetch?.status ?? null,
          redirects: finalFetch?.redirects.map((u) => u.toString()) ?? [],
          tls: tlsMeta,
          headerGrade: headerResult.grade,
          headers: headerResult.headers,
          securityTxt,
          mixedContent,
          scriptsWithoutIntegrity,
          technologies,
          caa: caaPresent ? [`CAA records present for ${finalUrl.hostname}`] : [],
          cookies: { total: cookies.total, weak: cookies.weak },
          domain: rdap,
          investigatorClues,
        },
      },
    };
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = scoreFindings(findings);
  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'website_check',
    score,
    grade: gradeForScore(score),
    summary: resultSummary(score, findings),
    findings,
    checkedAt: new Date().toISOString(),
    meta: {
      target: original.url.toString(),
      httpStatus: http?.status ?? null,
      checksRun: 7,
      website: {
        finalUrl: original.url.toString(),
        httpStatus: http?.status ?? null,
        redirects: [],
        tls: null,
        headerGrade: 'F',
        headers: [],
        securityTxt: null,
        mixedContent: [],
        scriptsWithoutIntegrity: [],
        technologies: [],
        caa: [],
        cookies: { total: 0, weak: 0 },
        domain: rdap,
        investigatorClues: [],
      },
    },
  };
}
