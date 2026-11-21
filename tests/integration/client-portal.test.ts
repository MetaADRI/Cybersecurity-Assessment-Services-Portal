import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { openDb } from '../../server/src/database/db';
import { runMigrations } from '../../server/src/database/migrations';
import { createApp } from '../../server/src/app';
import { HYGIENE_QUESTIONS } from '../../shared/free-services';
import { CLIENT_SESSION_MINUTES } from '../../server/src/repositories/clients';
import { isBlockedAddress } from '../../server/src/free-checks/website';
import { newId, nowIso } from '../../server/src/utils/time';
import type { Env } from '../../server/src/config/env';
import type { Db } from '../../server/src/database/db';
import type { Express } from 'express';

const REPORTS_DIR = './.tmp-test/client-portal-reports';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'postgres://localhost/odcmp_test',
  SESSION_SECRET: 'client-portal-test-secret-value',
  SESSION_TTL_HOURS: 2,
  CORS_ORIGINS: 'http://localhost',
  REPORTS_DIR,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_AUTH_MAX: 1000,
  FREE_CHECKS_UNLIMITED: false,
  FREE_CHECKS_PER_VISITOR_PER_DAY: 5,
  FREE_CHECKS_PER_IP_PER_DAY: 1000,
  FREE_CHECKS_PER_TARGET_PER_HOUR: 3,
  CLIENT_FREE_CHECKS_PER_DAY: 20,
  LOG_LEVEL: 'error',
};

type Agent = ReturnType<typeof request.agent>;

interface AuthenticatedClient {
  agent: Agent;
  csrf: string;
  userId: string;
  email: string;
}

let db: Db;
let app: Express;

const hygieneAnswers = Object.fromEntries(
  HYGIENE_QUESTIONS.map((question) => [question.id, 'yes']),
);

async function signupAndVerify(agent: Agent, email: string): Promise<AuthenticatedClient> {
  const password = 'Strong-Client-Passw0rd!';
  const signup = await agent.post('/api/v1/public/client/signup').send({
    name: 'Portal Test Client',
    company: 'Portal Test Company',
    email,
    phone: '+260970000000',
    password,
    confirmPassword: password,
  });
  expect(signup.status).toBe(201);
  expect(signup.body.devCode).toMatch(/^\d{6}$/);

  const verify = await agent.post('/api/v1/public/client/verify').send({
    email,
    code: signup.body.devCode,
  });
  expect(verify.status).toBe(200);
  expect(verify.body.csrfToken).toBeTruthy();

  return {
    agent,
    csrf: verify.body.csrfToken,
    userId: verify.body.user.id,
    email,
  };
}

function clientPost(
  client: AuthenticatedClient,
  url: string,
  body: unknown,
  ip = '198.51.100.40',
) {
  return client.agent
    .post(url)
    .set('x-csrf-token', client.csrf)
    .set('Origin', 'http://localhost')
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

function publicPost(agent: Agent, ip: string, body: unknown) {
  return agent
    .post('/api/v1/public/free-runs')
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

async function withLimits<T>(patch: Partial<Env>, fn: () => Promise<T>): Promise<T> {
  const before = { ...env };
  Object.assign(env, patch);
  try {
    return await fn();
  } finally {
    Object.assign(env, before);
  }
}

beforeAll(async () => {
  fs.rmSync(REPORTS_DIR, { recursive: true, force: true });
  db = openDb(env.DATABASE_URL, 'test_client_portal');
  await db.exec('DROP SCHEMA IF EXISTS test_client_portal CASCADE; CREATE SCHEMA test_client_portal;');
  await runMigrations(db);
  app = await createApp({ db, env });
});

afterAll(async () => {
  await db.close();
  fs.rmSync(REPORTS_DIR, { recursive: true, force: true });
});

describe('public free-service safeguards', () => {
  it('requires explicit consent before a website or email check can run', async () => {
    const agent = request.agent(app);
    const website = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'website_check',
      target: 'example.com',
      consentConfirmed: false,
    });
    expect(website.status).toBe(400);
    expect(JSON.stringify(website.body.error.details)).toMatch(/authorised/i);

    const email = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'email_check',
      target: 'example.com',
      consentConfirmed: false,
    });
    expect(email.status).toBe(400);
    expect(JSON.stringify(email.body.error.details)).toMatch(/authorised/i);

    const runs = await db
      .prepare('SELECT COUNT(*) AS count FROM free_service_runs')
      .get<{ count: string | number }>();
    expect(Number(runs?.count ?? 0)).toBe(0);
  });

  it('blocks loopback, private and metadata targets before any network request', async () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.0.0.5')).toBe(true);
    expect(isBlockedAddress('192.168.1.10')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);

    const agent = request.agent(app);
    const res = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'website_check',
      target: 'http://169.254.169.254/latest/meta-data/',
      consentConfirmed: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not a public internet host/i);
  });

  it('allows multiple completed checks under the daily visitor limit', async () => {
    const agent = request.agent(app);
    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };

    await withLimits({ FREE_CHECKS_PER_VISITOR_PER_DAY: 5 }, async () => {
      const first = await publicPost(agent, '198.51.100.10', payload);
      const second = await publicPost(agent, '198.51.100.10', payload);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.run.status).toBe('completed');
    });
  });

  it('returns 429 with retry information on the sixth completed check in 24 hours', async () => {
    const agent = request.agent(app);
    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };

    await withLimits({ FREE_CHECKS_PER_VISITOR_PER_DAY: 5 }, async () => {
      const responses = [];
      for (let index = 0; index < 6; index += 1) {
        responses.push(await publicPost(agent, '198.51.100.11', payload));
      }

      expect(responses.slice(0, 5).map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
      const limited = responses[5];
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('free_check_limit_reached');
      expect(limited.body.error.details).toMatchObject({
        limit: 'visitor',
        used: 5,
        max: 5,
        windowMs: 86_400_000,
      });
      expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(limited.body.error.details.resetAt))).toBe(false);
    });
  });

  it('limits repeated checks against the same target per hour', async () => {
    const agent = request.agent(app);
    const payload = {
      serviceKey: 'subnet_calculator',
      target: '203.0.113.77/24',
    };

    await withLimits({ FREE_CHECKS_PER_TARGET_PER_HOUR: 1 }, async () => {
      const first = await publicPost(agent, '198.51.100.12', payload);
      const second = await publicPost(agent, '198.51.100.12', payload);
      expect(first.status).toBe(201);
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('free_check_limit_reached');
      expect(second.body.error.details.limit).toBe('target');
      expect(second.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  it('gives signed-in clients the higher daily limit', async () => {
    const client = await signupAndVerify(request.agent(app), 'limit-client@test.local');
    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };

    await withLimits({ FREE_CHECKS_PER_VISITOR_PER_DAY: 1 }, async () => {
      const first = await clientPost(
        client,
        '/api/v1/public/free-runs',
        payload,
        '198.51.100.13',
      );
      const second = await clientPost(
        client,
        '/api/v1/public/free-runs',
        payload,
        '198.51.100.13',
      );
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });
  });

  it('bypasses the daily limits but keeps the per-minute limiter when unlimited is enabled', async () => {
    const agent = request.agent(app);
    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };

    await withLimits(
      { FREE_CHECKS_UNLIMITED: true, FREE_CHECKS_PER_VISITOR_PER_DAY: 1 },
      async () => {
        const first = await publicPost(agent, '198.51.100.14', payload);
        const second = await publicPost(agent, '198.51.100.14', payload);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
      },
    );
  });

  it('does not count failed or unreachable runs toward the daily limit', async () => {
    const agent = request.agent(app);
    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };

    await withLimits({ FREE_CHECKS_PER_VISITOR_PER_DAY: 2 }, async () => {
      const first = await publicPost(agent, '198.51.100.15', payload);
      expect(first.status).toBe(201);

      const latest = await db
        .prepare('SELECT visitor_id FROM free_service_runs ORDER BY created_at DESC LIMIT 1')
        .get<{ visitor_id: string }>();
      await db
        .prepare(
          `INSERT INTO free_service_runs
             (id, visitor_id, service_key, target, consent_confirmed, status, score, results_json, created_at)
           VALUES (?, ?, 'website_check', 'https://unreachable.test', 1, 'failed', 56, ?, ?)`,
        )
        .run(
          newId(),
          latest!.visitor_id,
          JSON.stringify({ serviceKey: 'website_check', findings: [{ id: 'web.unreachable' }] }),
          nowIso(),
        );

      const second = await publicPost(agent, '198.51.100.15', payload);
      expect(second.status).toBe(201);
    });
  });

  it('calculates a subnet tool result without requiring consent', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'subnet_calculator',
      target: '10.20.30.40/24',
    });
    expect(res.status).toBe(201);
    expect(res.body.run.status).toBe('completed');
    expect(res.body.run.result.meta.subnet).toMatchObject({
      cidr: '10.20.30.0/24',
      network: '10.20.30.0',
      broadcast: '10.20.30.255',
      usableHosts: '254',
      scope: 'Private (RFC 1918)',
    });
    expect(res.body.run.result.findings[0].id).toBe('subnet.calculated');
  });

  it('reviews pasted suspicious email without requiring consent', async () => {
    const agent = request.agent(app);
    const catalog = await agent.get('/api/v1/public/catalog');
    expect(
      catalog.body.items.some((item: { key: string }) => item.key === 'email_phishing_check'),
    ).toBe(true);

    const res = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'email_phishing_check',
      target: `Authentication-Results: mx.example.com; spf=fail; dkim=fail; dmarc=fail
From: "PayPal Security" <security@random-mail.test>
Reply-To: billing@different-domain.test
Subject: Urgent: verify your account
Dear User, send your password and one-time code now: https://bit.ly/verify-now
`,
    });
    expect(res.status).toBe(201);
    expect(res.body.run.status).toBe('completed');
    expect(res.body.run.result.serviceKey).toBe('email_phishing_check');
    expect(res.body.run.result.findings.map((item: { id: string }) => item.id)).toContain(
      'emailphish.credential_request',
    );
    expect(JSON.stringify(res.body.run.result)).not.toContain('one-time code now');
  });
});

describe('client portal isolation and session expiry', () => {
  let clientA: AuthenticatedClient;
  let clientB: AuthenticatedClient;
  let runId = '';
  let reportId = '';
  let requestId = '';

  it('links a completed visitor check to the verified client account', async () => {
    const agent = request.agent(app);
    await agent.get('/api/v1/public/catalog');

    const run = await agent.post('/api/v1/public/free-runs').send({
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    });
    expect(run.status).toBe(201);
    runId = run.body.run.id;

    clientA = await signupAndVerify(agent, 'client-a@test.local');

    const dashboard = await clientA.agent.get('/api/v1/client/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.latestRun.id).toBe(runId);
    expect(dashboard.body.runs.some((item: { id: string }) => item.id === runId)).toBe(true);

    const reports = await clientA.agent.get('/api/v1/client/reports');
    expect(reports.status).toBe(200);
    expect(reports.body.items.length).toBeGreaterThan(0);
    reportId = reports.body.items[0].id;

    const ownRun = await clientA.agent.get(`/api/v1/client/runs/${runId}`);
    expect(ownRun.status).toBe(200);

    const created = await clientPost(clientA, '/api/v1/client/requests', {
      serviceKey: 'penetration_testing',
      message: 'Please scope a test for our customer portal.',
      contactPreference: 'email',
    });
    expect(created.status).toBe(201);
    requestId = created.body.request.id;
  });

  it('does not let client B read client A runs, reports, requests or profile data', async () => {
    clientB = await signupAndVerify(request.agent(app), 'client-b@test.local');

    const otherRun = await clientB.agent.get(`/api/v1/client/runs/${runId}`);
    expect(otherRun.status).toBe(404);

    const otherReport = await clientB.agent.get(`/api/v1/client/reports/${reportId}/download`);
    expect(otherReport.status).toBe(404);

    const ownRequests = await clientB.agent.get('/api/v1/client/requests');
    expect(ownRequests.status).toBe(200);
    expect(ownRequests.body.items).toHaveLength(0);

    const bDashboard = await clientB.agent.get('/api/v1/client/dashboard');
    expect(bDashboard.status).toBe(200);
    expect(bDashboard.body.user.email).toBe('client-b@test.local');
    expect(JSON.stringify(bDashboard.body)).not.toMatch(/client-a@test\.local/);
    expect(JSON.stringify(bDashboard.body)).not.toContain(runId);
    expect(JSON.stringify(bDashboard.body)).not.toContain(requestId);
  });

  it('expires an idle client session after the five-minute window', async () => {
    const idle = await signupAndVerify(request.agent(app), 'client-idle@test.local');
    expect(CLIENT_SESSION_MINUTES).toBe(5);

    const past = new Date(Date.now() - 60_000).toISOString();
    await db
      .prepare('UPDATE client_sessions SET expires_at = ? WHERE client_id = ?')
      .run(past, idle.userId);

    const me = await idle.agent.get('/api/v1/client/me');
    expect(me.status).toBe(401);

    const remaining = await db
      .prepare('SELECT COUNT(*) AS count FROM client_sessions WHERE client_id = ?')
      .get<{ count: string | number }>(idle.userId);
    expect(Number(remaining?.count ?? 0)).toBe(0);
  });

  it('still returns client A data for the active account', async () => {
    const requests = await clientA.agent.get('/api/v1/client/requests');
    expect(requests.status).toBe(200);
    expect(requests.body.items.map((item: { id: string }) => item.id)).toContain(requestId);

    const ownReport = await clientA.agent.get(`/api/v1/client/reports/${reportId}/download`);
    expect(ownReport.status).toBe(200);
    expect(ownReport.headers['content-type']).toContain('application/pdf');
  });
});
