import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { openDb } from '../../server/src/database/db';
import { runMigrations } from '../../server/src/database/migrations';
import { createApp } from '../../server/src/app';
import { HYGIENE_QUESTIONS } from '../../shared/free-services';
import { CLIENT_SESSION_MINUTES } from '../../server/src/repositories/clients';
import { isBlockedAddress } from '../../server/src/free-checks/website';
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

function clientPost(client: AuthenticatedClient, url: string, body: unknown) {
  return client.agent
    .post(url)
    .set('x-csrf-token', client.csrf)
    .set('Origin', 'http://localhost')
    .send(body as object);
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

  it('allows exactly one free service per visitor, even with parallel requests', async () => {
    const agent = request.agent(app);
    const catalog = await agent.get('/api/v1/public/catalog');
    expect(catalog.status).toBe(200);
    expect(
      catalog.body.items.some((item: { key: string }) => item.key === 'hygiene_assessment'),
    ).toBe(true);

    const payload = {
      serviceKey: 'hygiene_assessment',
      consentConfirmed: false,
      answers: hygieneAnswers,
    };
    const results = await Promise.all([
      agent.post('/api/v1/public/free-runs').send(payload),
      agent.post('/api/v1/public/free-runs').send(payload),
    ]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);

    const rejected = results.find((res) => res.status === 409);
    expect(rejected?.body.error.code).toBe('free_service_used');
    expect(rejected?.body.error.details.usedService).toBe('hygiene_assessment');

    const later = await agent.post('/api/v1/public/free-runs').send(payload);
    expect(later.status).toBe(409);

    const completed = await db
      .prepare("SELECT COUNT(*) AS count FROM free_service_runs WHERE status = 'completed'")
      .get<{ count: string | number }>();
    expect(Number(completed?.count ?? 0)).toBe(1);
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
