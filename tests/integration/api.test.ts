import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../server/src/database/db';
import { runMigrations } from '../../server/src/database/migrations';
import { seedDefaultConfiguration } from '../../server/src/database/defaults';
import { createApp } from '../../server/src/app';
import { createUser, findUserByEmail, listUsers } from '../../server/src/repositories/users';
import { hashPassword } from '../../server/src/security/password';
import type { Env } from '../../server/src/config/env';
import type { Db } from '../../server/src/database/db';
import type { Express } from 'express';

const REPORTS_DIR = './.tmp-test/integration-reports';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'postgres://localhost/odcmp_test',
  SESSION_SECRET: 'integration-test-secret-value',
  SESSION_TTL_HOURS: 2,
  CORS_ORIGINS: 'http://localhost',
  REPORTS_DIR,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_AUTH_MAX: 1000,
  FREE_CHECKS_UNLIMITED: false,
  FREE_CHECKS_PER_VISITOR_PER_DAY: 5,
  FREE_CHECKS_PER_IP_PER_DAY: 20,
  FREE_CHECKS_PER_TARGET_PER_HOUR: 3,
  CLIENT_FREE_CHECKS_PER_DAY: 20,
  LOG_LEVEL: 'error',
};

let db: Db;
let app: Express;

interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

async function login(email: string, password: string): Promise<Session> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return { agent, csrf: res.body.csrfToken };
}

function post(session: Session, url: string, body: unknown) {
  return session.agent
    .post(url)
    .set('x-csrf-token', session.csrf)
    .set('Origin', 'http://localhost')
    .send(body as object);
}

function patch(session: Session, url: string, body: unknown) {
  return session.agent
    .patch(url)
    .set('x-csrf-token', session.csrf)
    .set('Origin', 'http://localhost')
    .send(body as object);
}

function put(session: Session, url: string, body: unknown) {
  return session.agent
    .put(url)
    .set('x-csrf-token', session.csrf)
    .set('Origin', 'http://localhost')
    .send(body as object);
}

let admin: Session;
let analyst: Session;
let reviewer: Session;
const controlIdByKeys: Record<string, string> = {};

beforeAll(async () => {
  fs.rmSync(REPORTS_DIR, { recursive: true, force: true });
  db = openDb(env.DATABASE_URL, 'test_api');
  await db.exec('DROP SCHEMA IF EXISTS test_api CASCADE; CREATE SCHEMA test_api;');
  await runMigrations(db);
  await seedDefaultConfiguration(db);

  await createUser(db, {
    email: 'admin@test.local',
    fullName: 'Test Admin',
    role: 'admin',
    passwordHash: await hashPassword('Admin-Passw0rd!'),
  });
  await createUser(db, {
    email: 'analyst@test.local',
    fullName: 'Test Analyst',
    role: 'analyst',
    passwordHash: await hashPassword('Analyst-Passw0rd!'),
  });
  await createUser(db, {
    email: 'reviewer@test.local',
    fullName: 'Test Reviewer',
    role: 'reviewer',
    passwordHash: await hashPassword('Reviewer-Passw0rd!'),
  });

  app = await createApp({ db, env });
  admin = await login('admin@test.local', 'Admin-Passw0rd!');
  analyst = await login('analyst@test.local', 'Analyst-Passw0rd!');
  reviewer = await login('reviewer@test.local', 'Reviewer-Passw0rd!');

  const controls = await analyst.agent.get('/api/v1/settings/controls');
  for (const control of controls.body.items) controlIdByKeys[control.controlKey] = control.id;
});

afterAll(async () => {
  await db.close();
});

describe('authentication and authorization', () => {
  it('rejects unauthenticated access to protected data', async () => {
    const res = await request(app).get('/api/v1/customers');
    expect(res.status).toBe(401);
  });

  it('rejects bad credentials without revealing whether the account exists', async () => {
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'not-the-password' });
    expect(bad.status).toBe(401);
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.local', password: 'whatever12345' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);
  });

  it('returns the current user and CSRF token after login', async () => {
    const res = await admin.agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.local');
    expect(res.body.csrfToken).toBeTruthy();
  });

  it('rejects a state-changing request without a CSRF token', async () => {
    const res = await analyst.agent
      .post('/api/v1/customers')
      .set('Origin', 'http://localhost')
      .send({ name: 'No CSRF Co', industry: 'Retail' });
    expect(res.status).toBe(403);
  });

  it('forbids a read-only reviewer from changing records', async () => {
    const res = await post(reviewer, '/api/v1/customers', {
      name: 'Reviewer Should Not Create',
      industry: 'Retail',
    });
    expect(res.status).toBe(403);
  });

  it('forbids an analyst from managing users', async () => {
    const res = await analyst.agent.get('/api/v1/users');
    expect(res.status).toBe(403);
  });

  it('forbids a reviewer from changing scoring configuration', async () => {
    const res = await put(reviewer, '/api/v1/settings/scoring', {
      weights: { vulnerability_management: 100 },
      coverageThreshold: 80,
      rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
    });
    expect(res.status).toBe(403);
  });
});

describe('workflow A - customer creation', () => {
  it('creates a customer that can be read back', async () => {
    const res = await post(analyst, '/api/v1/customers', {
      name: 'Integration Test Bank',
      industry: 'Banking',
      description: 'Fictional test customer',
      contactName: 'Test Contact',
      contactEmail: 'contact@example.com',
      scope: 'Head office network and customer portal',
    });
    expect(res.status).toBe(201);
    expect(res.body.customer.id).toMatch(/^[0-9a-f-]{36}$/);

    const list = await analyst.agent.get('/api/v1/customers');
    expect(list.body.items.some((c: { name: string }) => c.name === 'Integration Test Bank')).toBe(
      true,
    );

    const detail = await analyst.agent.get(`/api/v1/customers/${res.body.customer.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.customer.name).toBe('Integration Test Bank');
  });

  it('rejects duplicate active customer names', async () => {
    const res = await post(analyst, '/api/v1/customers', {
      name: 'integration test bank',
      industry: 'Banking',
    });
    expect(res.status).toBe(409);
  });

  it('validates required fields', async () => {
    const res = await post(analyst, '/api/v1/customers', { name: '', industry: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('returns 404 for an unknown customer id', async () => {
    const res = await analyst.agent.get('/api/v1/customers/11111111-1111-1111-1111-111111111111');
    expect(res.status).toBe(404);
  });
});

describe('workflow B - assessment and scoring', () => {
  let customerId = '';
  let assessmentId = '';
  let secondAssessmentId = '';

  it('creates an assessment with every control from the library', async () => {
    const customers = await analyst.agent.get('/api/v1/customers');
    customerId = customers.body.items.find(
      (c: { name: string }) => c.name === 'Integration Test Bank',
    ).id;

    const res = await post(analyst, '/api/v1/assessments', {
      customerId,
      title: 'Baseline assessment',
      type: 'baseline',
      scope: 'Head office network and customer portal',
      assessmentDate: '2026-05-01',
      assessor: 'Integration Tester',
      status: 'draft',
    });
    expect(res.status).toBe(201);
    assessmentId = res.body.assessment.id;

    const detail = await analyst.agent.get(`/api/v1/assessments/${assessmentId}`);
    expect(detail.body.controls.length).toBeGreaterThanOrEqual(23);
    expect(detail.body.score.coveragePct).toBe(0);
    expect(detail.body.score.eligible).toBe(false);
    expect(detail.body.score.provisional).toBe(true);
  });

  it('never treats a missing response as effective', async () => {
    const detail = await analyst.agent.get(`/api/v1/assessments/${assessmentId}`);
    const unassessed = detail.body.controls.filter(
      (c: { status: string }) => c.status === 'not_assessed',
    );
    expect(unassessed.length).toBe(detail.body.controls.length);
    expect(detail.body.score.overallScore).toBeNull();
    expect(detail.body.score.assessedControls).toBe(0);
  });

  it('requires a justification for controls marked not applicable', async () => {
    const controlId = controlIdByKeys['CN-03'];
    const res = await post(analyst, `/api/v1/assessments/${assessmentId}/controls/${controlId}`, {
      status: 'not_applicable',
      justification: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/justification/i);
  });

  it('produces a reproducible score that matches an independent calculation', async () => {
    // Every control effective -> 100.
    for (const controlId of Object.values(controlIdByKeys)) {
      const res = await post(analyst, `/api/v1/assessments/${assessmentId}/controls/${controlId}`, {
        status: 'effective',
        evidenceNotes: 'Verified during integration test.',
      });
      expect(res.status).toBe(200);
    }
    let score = (await analyst.agent.get(`/api/v1/assessments/${assessmentId}/score`)).body.score;
    expect(score.overallScore).toBe(100);
    expect(score.coveragePct).toBe(100);
    expect(score.eligible).toBe(true);

    // Set the whole Vulnerability Management category (weight 25) to ineffective.
    for (const key of ['VM-01', 'VM-02', 'VM-03', 'VM-04']) {
      await post(analyst, `/api/v1/assessments/${assessmentId}/controls/${controlIdByKeys[key]}`, {
        status: 'ineffective',
      });
    }
    score = (await analyst.agent.get(`/api/v1/assessments/${assessmentId}/score`)).body.score;
    // Independent expectation: (0*25 + 100*75) / 100 = 75
    expect(score.overallScore).toBe(75);
    const vm = score.categories.find(
      (c: { categoryKey: string }) => c.categoryKey === 'vulnerability_management',
    );
    expect(vm.score).toBe(0);
    expect(vm.weight).toBe(25);
    expect(score.coveragePct).toBe(100);
    expect(score.eligible).toBe(true);
  });

  it('refuses to complete an assessment that does not meet the coverage threshold', async () => {
    const res = await post(analyst, '/api/v1/assessments', {
      customerId,
      title: 'Thin coverage assessment',
      type: 'targeted',
      scope: 'Head office network and customer portal',
      assessmentDate: '2026-05-02',
      assessor: 'Integration Tester',
      status: 'draft',
    });
    secondAssessmentId = res.body.assessment.id;
    const controls = (await analyst.agent.get(`/api/v1/assessments/${secondAssessmentId}`)).body
      .controls;
    // Assess only 2 of 23 controls.
    for (const control of controls.slice(0, 2)) {
      await post(
        analyst,
        `/api/v1/assessments/${secondAssessmentId}/controls/${control.controlId}`,
        {
          status: 'effective',
        },
      );
    }
    const score = (await analyst.agent.get(`/api/v1/assessments/${secondAssessmentId}/score`)).body
      .score;
    expect(score.eligible).toBe(false);
    expect(score.coveragePct).toBeLessThan(80);

    const complete = await post(analyst, `/api/v1/assessments/${secondAssessmentId}/complete`, {});
    expect(complete.status).toBe(409);
    expect(complete.body.error.message).toMatch(/cannot be completed/i);
  });

  it('freezes the score snapshot when the assessment is completed', async () => {
    const res = await post(analyst, `/api/v1/assessments/${assessmentId}/complete`, {});
    expect(res.status).toBe(200);
    expect(res.body.score.overallScore).toBe(75);
    expect(res.body.assessment.status).toBe('completed');
    expect(res.body.assessment.provisional).toBe(false);
  });

  it('keeps the frozen score even after scoring configuration changes', async () => {
    const before = (await analyst.agent.get(`/api/v1/assessments/${assessmentId}/score`)).body
      .score;
    expect(before.overallScore).toBe(75);

    const change = await put(admin, '/api/v1/settings/scoring', {
      weights: {
        vulnerability_management: 0,
        identity_access: 45,
        endpoint_security: 20,
        cloud_network: 15,
        security_awareness: 10,
        incident_response: 10,
      },
      coverageThreshold: 80,
      rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
    });
    expect(change.status).toBe(200);

    const after = (await analyst.agent.get(`/api/v1/assessments/${assessmentId}/score`)).body.score;
    expect(after.overallScore).toBe(75);
    expect(after.methodologyVersion).toBe(before.methodologyVersion);

    // Restore the default weights for the rest of the suite.
    await put(admin, '/api/v1/settings/scoring', {
      weights: {
        vulnerability_management: 25,
        identity_access: 20,
        endpoint_security: 20,
        cloud_network: 15,
        security_awareness: 10,
        incident_response: 10,
      },
      coverageThreshold: 80,
      rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
    });
  });

  it('refuses to edit a completed assessment', async () => {
    const res = await patch(analyst, `/api/v1/assessments/${assessmentId}`, { title: 'Renamed' });
    expect(res.status).toBe(409);
  });

  it('rejects scoring weights that do not total 100', async () => {
    const res = await put(admin, '/api/v1/settings/scoring', {
      weights: { vulnerability_management: 50 },
      coverageThreshold: 80,
      rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/total 100/);
  });

  it('exposes rule-based recommendations linked to recorded results', async () => {
    const res = await analyst.agent.get(`/api/v1/assessments/${assessmentId}/recommendations`);
    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((r: { ruleId: string }) => r.ruleId);
    expect(ids).toContain('critical-vuln-remediation');
    for (const r of res.body.recommendations) expect(r.trigger.length).toBeGreaterThan(0);
  });
});

describe('workflow C and D - findings and remediation', () => {
  let customerId = '';
  let assessmentId = '';
  let findingId = '';

  beforeAll(async () => {
    const customers = await analyst.agent.get('/api/v1/customers');
    customerId = customers.body.items.find(
      (c: { name: string }) => c.name === 'Integration Test Bank',
    ).id;
    const assessments = await analyst.agent.get('/api/v1/assessments?customerId=' + customerId);
    assessmentId = assessments.body.items[0].id;
  });

  it('creates a finding linked to the customer and assessment', async () => {
    const res = await post(analyst, '/api/v1/findings', {
      customerId,
      assessmentId,
      title: 'Exposed administrative interface',
      description: 'The admin interface was reachable from the public internet during testing.',
      severity: 'critical',
      asset: 'admin.example.test',
      discoveredDate: '2026-05-01',
      exploitability: 'poc',
      exposure: 'internet',
      businessImpact: 'high',
      recommendedRemediation: 'Restrict access to the VPN range and re-test.',
      targetDate: '2026-05-20',
    });
    expect(res.status).toBe(201);
    findingId = res.body.finding.id;
    expect(res.body.finding.findingKey).toMatch(/^FND-\d{4}$/);
    expect(res.body.suggestedPriority).toBe('P1');
    expect(res.body.finding.prioritySource).toBe('calculated');
  });

  it('shows the finding in the list, customer view and dashboard counts', async () => {
    const list = await analyst.agent.get('/api/v1/findings?pageSize=100');
    expect(list.body.items.some((f: { id: string }) => f.id === findingId)).toBe(true);

    const customer = await analyst.agent.get(`/api/v1/customers/${customerId}`);
    expect(customer.body.counts.criticalOpen).toBeGreaterThan(0);

    const dashboard = await analyst.agent.get('/api/v1/dashboard/summary');
    expect(dashboard.body.counts.criticalOpen).toBeGreaterThan(0);
    expect(dashboard.body.topIssues.length).toBeGreaterThan(0);
  });

  it('validates that the assessment belongs to the same customer', async () => {
    const other = await post(analyst, '/api/v1/customers', {
      name: 'Other Customer',
      industry: 'Retail',
    });
    const res = await post(analyst, '/api/v1/findings', {
      customerId: other.body.customer.id,
      assessmentId,
      title: 'Wrong assessment link',
      description: 'This should be rejected.',
      severity: 'low',
      discoveredDate: '2026-05-01',
    });
    expect(res.status).toBe(400);
  });

  it('walks the remediation lifecycle and preserves history', async () => {
    let res = await post(analyst, `/api/v1/findings/${findingId}/status`, {
      status: 'in_progress',
      note: 'Owner assigned, fix in preparation.',
    });
    expect(res.status).toBe(200);

    res = await post(analyst, `/api/v1/findings/${findingId}/status`, {
      status: 'pending_verification',
      note: 'Fix applied, awaiting independent check.',
    });
    expect(res.status).toBe(200);

    const history = await analyst.agent.get(`/api/v1/findings/${findingId}/history`);
    expect(history.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'open',
      'in_progress',
      'pending_verification',
    ]);
  });

  it('rejects resolving a finding without resolution notes or evidence', async () => {
    const res = await post(analyst, `/api/v1/findings/${findingId}/status`, { status: 'resolved' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/resolution notes/i);
  });

  it('rejects an invalid transition', async () => {
    const created = await post(analyst, '/api/v1/findings', {
      customerId,
      title: 'Open finding cannot jump to resolved',
      description: 'Used to prove the state machine is enforced on the server.',
      severity: 'medium',
      discoveredDate: '2026-05-04',
    });
    const id = created.body.finding.id;
    const res = await post(analyst, `/api/v1/findings/${id}/status`, {
      status: 'resolved',
      resolutionNotes: 'Skipping verification should not be possible.',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not allowed/);
  });

  it('does not allow applying the same status twice', async () => {
    const first = await post(analyst, `/api/v1/findings/${findingId}/status`, {
      status: 'resolved',
      resolutionNotes: 'Fix confirmed by re-testing the interface.',
      verificationEvidence: 'Re-test output attached to the ticket.',
    });
    expect(first.status).toBe(200);

    const again = await post(analyst, `/api/v1/findings/${findingId}/status`, {
      status: 'resolved',
      resolutionNotes: 'Duplicate attempt',
    });
    expect(again.status).toBe(409);
  });

  it('requires justification and a decision maker for risk acceptance', async () => {
    const created = await post(analyst, '/api/v1/findings', {
      customerId,
      title: 'Legacy cipher suite',
      description: 'An old cipher suite is still enabled on the portal.',
      severity: 'low',
      discoveredDate: '2026-05-03',
    });
    const id = created.body.finding.id;
    const bad = await post(analyst, `/api/v1/findings/${id}/status`, { status: 'accepted_risk' });
    expect(bad.status).toBe(400);

    const ok = await post(analyst, `/api/v1/findings/${id}/status`, {
      status: 'accepted_risk',
      riskJustification: 'Business owner accepted the residual risk for this quarter.',
      riskDecisionMaker: 'Test Risk Committee',
      riskReviewDate: '2026-08-01',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.finding.status).toBe('accepted_risk');
  });

  it('recalculates priority when severity changes and supports a justified override', async () => {
    const res = await patch(analyst, `/api/v1/findings/${findingId}`, {
      severity: 'informational',
    });
    expect(res.status).toBe(200);
    expect(res.body.finding.prioritySource).toBe('calculated');

    const override = await patch(analyst, `/api/v1/findings/${findingId}`, {
      priority: 'P4',
      priorityJustification: 'No longer reachable after the firewall change.',
    });
    expect(override.status).toBe(200);
    expect(override.body.finding.prioritySource).toBe('manual');
    expect(override.body.finding.priority).toBe('P4');
  });

  it('records progress notes', async () => {
    const res = await post(analyst, `/api/v1/findings/${findingId}/activities`, {
      body: 'Firewall rule change scheduled for the weekend window.',
    });
    expect(res.status).toBe(201);
    const history = await analyst.agent.get(`/api/v1/findings/${findingId}/history`);
    expect(history.body.activities.length).toBeGreaterThan(0);
  });

  it('blocks a read-only reviewer from changing a finding', async () => {
    const res = await post(reviewer, `/api/v1/findings/${findingId}/status`, {
      status: 'in_progress',
      note: 'not allowed',
    });
    expect(res.status).toBe(403);
  });
});

describe('workflow E - score history', () => {
  it('compares a later assessment with the earlier snapshot without overwriting it', async () => {
    const customers = await analyst.agent.get('/api/v1/customers');
    const customerId = customers.body.items.find(
      (c: { name: string }) => c.name === 'Integration Test Bank',
    ).id;
    const assessments = await analyst.agent.get(`/api/v1/assessments?customerId=${customerId}`);
    const completed = assessments.body.items.find(
      (a: { status: string }) => a.status === 'completed',
    );
    const before = (await analyst.agent.get(`/api/v1/assessments/${completed.id}/score`)).body
      .score;

    // Complete a second assessment with the same scope and all controls effective.
    const created = await post(analyst, '/api/v1/assessments', {
      customerId,
      title: 'Reassessment',
      type: 'reassessment',
      scope: completed.scope,
      assessmentDate: '2026-09-01',
      assessor: 'Integration Tester',
      status: 'draft',
    });
    const newId = created.body.assessment.id;
    const controls = (await analyst.agent.get(`/api/v1/assessments/${newId}`)).body.controls;
    for (const control of controls) {
      await post(analyst, `/api/v1/assessments/${newId}/controls/${control.controlId}`, {
        status: 'effective',
      });
    }
    const done = await post(analyst, `/api/v1/assessments/${newId}/complete`, {});
    expect(done.status).toBe(200);
    expect(done.body.score.overallScore).toBe(100);

    const history = await analyst.agent.get(`/api/v1/assessments/${newId}/history`);
    expect(history.status).toBe(200);
    expect(history.body.previous.id).toBe(completed.id);
    expect(history.body.comparison.scoreChange).toBe(25);

    // The earlier assessment snapshot is untouched.
    const after = (await analyst.agent.get(`/api/v1/assessments/${completed.id}/score`)).body.score;
    expect(after.overallScore).toBe(before.overallScore);
  });
});

describe('workflow F - PDF reporting', () => {
  let assessmentId = '';

  beforeAll(async () => {
    const assessments = await analyst.agent.get('/api/v1/assessments?status=completed');
    assessmentId = assessments.body.items[0].id;
  });

  it('previews report contents before generating a file', async () => {
    const res = await analyst.agent.get(
      `/api/v1/reports/preview?assessmentId=${assessmentId}&type=executive`,
    );
    expect(res.status).toBe(200);
    expect(res.body.content.reportKey).toBe('PREVIEW');
    expect(res.body.content.blocks.length).toBeGreaterThan(5);
    expect(res.body.content.customer.name).toBeTruthy();
  });

  it('generates an executive PDF containing real application data', async () => {
    const res = await post(analyst, '/api/v1/reports/generate', {
      assessmentId,
      type: 'executive',
    });
    expect(res.status).toBe(201);
    expect(res.body.report.fileName).toMatch(/^RPT-\d{4}\.pdf$/);
    expect(res.body.report.fileSize).toBeGreaterThan(1000);

    const file = path.resolve(REPORTS_DIR, res.body.report.fileName);
    expect(fs.existsSync(file)).toBe(true);
    const head = fs.readFileSync(file).subarray(0, 5).toString('utf8');
    expect(head).toBe('%PDF-');

    // The stored snapshot contains the customer name and the score.
    const snapshot = JSON.parse(res.body.report.snapshot);
    expect(snapshot.customer.name).toBe('Integration Test Bank');
    expect(snapshot.score.overallScore).toBe(100);
  });

  it('generates technical and remediation reports', async () => {
    for (const type of ['technical', 'remediation']) {
      const res = await post(analyst, '/api/v1/reports/generate', { assessmentId, type });
      expect(res.status).toBe(201);
      expect(res.body.report.type).toBe(type);
    }
  });

  it('serves the generated file for download', async () => {
    const list = await analyst.agent.get('/api/v1/reports?pageSize=1');
    const id = list.body.items[0].id;
    const res = await analyst.agent.get(`/api/v1/reports/${id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('refuses a path traversal attempt on the report file name', async () => {
    const res = await analyst.agent.get('/api/v1/reports/..%2F..%2F..%2Fetc%2Fpasswd/download');
    expect([400, 404]).toContain(res.status);
  });

  it('does not generate a report for a draft assessment', async () => {
    const customers = await analyst.agent.get('/api/v1/customers');
    const customerId = customers.body.items.find(
      (c: { name: string }) => c.name === 'Integration Test Bank',
    ).id;
    const draft = await post(analyst, '/api/v1/assessments', {
      customerId,
      title: 'Draft only assessment',
      type: 'baseline',
      scope: 'Anything',
      assessmentDate: '2026-10-01',
      assessor: 'Integration Tester',
      status: 'draft',
    });
    const res = await post(analyst, '/api/v1/reports/generate', {
      assessmentId: draft.body.assessment.id,
      type: 'executive',
    });
    expect(res.status).toBe(400);
  });
});

describe('workflow G - CSV import', () => {
  let customerId = '';

  beforeAll(async () => {
    const customers = await analyst.agent.get('/api/v1/customers');
    customerId = customers.body.items.find(
      (c: { name: string }) => c.name === 'Integration Test Bank',
    ).id;
  });

  it('reports missing required columns without importing anything', async () => {
    const res = await post(analyst, '/api/v1/import/preview', {
      csv: 'foo,bar\n1,2\n',
      customerId,
    });
    expect(res.status).toBe(200);
    expect(res.body.errors.map((e: { message: string }) => e.message).join(' ')).toMatch(
      /Missing required column/,
    );
    expect(res.body.rows).toHaveLength(0);

    const commit = await post(analyst, '/api/v1/import/commit', {
      csv: 'foo,bar\n1,2\n',
      customerId,
      confirmed: true,
      skippedRows: [],
    });
    expect(commit.status).toBe(400);
  });

  it('reports row-level errors without importing anything', async () => {
    const csv = [
      'title,description,severity,customer_id,discovered_date',
      'Valid row,A description,high,' + customerId + ',2026-05-01',
      'Broken row,,not-a-severity,,not-a-date',
    ].join('\n');
    const preview = await post(analyst, '/api/v1/import/preview', { csv, customerId });
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(1);
    expect(preview.body.errors.length).toBeGreaterThan(0);

    const commit = await post(analyst, '/api/v1/import/commit', {
      csv,
      customerId,
      confirmed: true,
      skippedRows: [],
    });
    expect(commit.status).toBe(400);
    const list = await analyst.agent.get('/api/v1/findings?q=Valid%20row');
    expect(list.body.total).toBe(0);
  });

  it('imports valid rows in a single transaction and protects against duplicates', async () => {
    const csv = [
      'title,description,severity,customer_id,discovered_date,target_date',
      `Imported row one,First imported finding,high,${customerId},2026-05-01,2026-06-01`,
      `Imported row two,Second imported finding,low,${customerId},2026-05-02,`,
    ].join('\n');

    const first = await post(analyst, '/api/v1/import/commit', {
      csv,
      customerId,
      confirmed: true,
      skippedRows: [],
    });
    expect(first.status).toBe(200);
    expect(first.body.imported).toBe(2);

    const second = await post(analyst, '/api/v1/import/commit', {
      csv,
      customerId,
      confirmed: true,
      skippedRows: [],
    });
    expect(second.status).toBe(200);
    expect(second.body.imported).toBe(0);

    const list = await analyst.agent.get('/api/v1/findings?q=Imported%20row');
    expect(list.body.total).toBe(2);
  });

  it('blocks a read-only reviewer from importing', async () => {
    const res = await post(reviewer, '/api/v1/import/preview', {
      csv:
        'title,description,severity,customer_id,discovered_date\na,b,low,' +
        customerId +
        ',2026-05-01',
      customerId,
    });
    expect(res.status).toBe(403);
  });

  it('exports findings as CSV', async () => {
    const res = await analyst.agent.get('/api/v1/findings/export?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toContain('finding_key');
  });
});

describe('workflow I and J - persistence, empty and error states', () => {
  it('persists records across a database reopen', async () => {
    const first = openDb(env.DATABASE_URL, 'test_persistence');
    await first.exec('DROP SCHEMA IF EXISTS test_persistence CASCADE; CREATE SCHEMA test_persistence;');
    await runMigrations(first);
    await seedDefaultConfiguration(first);
    await first
      .prepare(
        'INSERT INTO customers (id, name, industry, status, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .run(
        '22222222-2222-2222-2222-222222222222',
        'Persistence Check Customer',
        'Testing',
        'active',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    await first.close();

    const second = openDb(env.DATABASE_URL, 'test_persistence');
    await runMigrations(second);
    const row = await second
      .prepare('SELECT name FROM customers WHERE id = ?')
      .get('22222222-2222-2222-2222-222222222222');
    expect(row).toEqual({ name: 'Persistence Check Customer' });
    await second.exec('DROP SCHEMA IF EXISTS test_persistence CASCADE;');
    await second.close();
  });

  it('returns structured validation errors for malformed bodies', async () => {
    const res = await analyst.agent
      .post('/api/v1/customers')
      .set('x-csrf-token', analyst.csrf)
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('returns 404 for unknown API endpoints', async () => {
    const res = await analyst.agent.get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('requires authentication even against an empty database', async () => {
    const freshDb = openDb(env.DATABASE_URL, 'test_empty');
    await freshDb.exec('DROP SCHEMA IF EXISTS test_empty CASCADE; CREATE SCHEMA test_empty;');
    await runMigrations(freshDb);
    await seedDefaultConfiguration(freshDb);
    const freshApp = await createApp({ db: freshDb, env });
    const res = await request(freshApp).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
    await freshDb.close();
  });

  it('never exposes password hashes through the API', async () => {
    const res = await admin.agent.get('/api/v1/users');
    expect(res.status).toBe(200);
    expect((await listUsers(db)).every((u) => !('passwordHash' in u))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
    expect((await findUserByEmail(db, 'admin@test.local'))?.passwordHash).not.toBe('Admin-Passw0rd!');
  });
});
