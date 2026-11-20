import type { Db } from './db';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Versioned schema migrations. Each migration is applied exactly once inside a
 * transaction and recorded in `schema_migrations`.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','analyst','reviewer')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        industry TEXT NOT NULL,
        contact_name TEXT,
        contact_email TEXT,
        phone TEXT,
        scope TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX idx_customers_active_name ON customers(lower(name)) WHERE status = 'active';
      CREATE INDEX idx_customers_status ON customers(status);

      CREATE TABLE security_categories (
        id TEXT PRIMARY KEY,
        category_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        weight INTEGER NOT NULL CHECK (weight >= 0 AND weight <= 100),
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE security_controls (
        id TEXT PRIMARY KEY,
        control_key TEXT NOT NULL UNIQUE,
        category_id TEXT NOT NULL REFERENCES security_categories(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        guidance TEXT NOT NULL DEFAULT '',
        rubric TEXT NOT NULL DEFAULT '',
        applicability TEXT NOT NULL DEFAULT '',
        evidence_requirements TEXT NOT NULL DEFAULT '',
        weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_controls_category ON security_controls(category_id);

      CREATE TABLE scoring_methodologies (
        version INTEGER PRIMARY KEY,
        config_json TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE assessments (
        id TEXT PRIMARY KEY,
        assessment_key TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        description TEXT,
        assessment_date TEXT NOT NULL,
        assessor TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','in_progress','completed','archived')),
        methodology_version INTEGER NOT NULL DEFAULT 1,
        coverage_threshold INTEGER NOT NULL DEFAULT 80,
        coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
        provisional INTEGER NOT NULL DEFAULT 1,
        overall_score DOUBLE PRECISION,
        previous_assessment_id TEXT REFERENCES assessments(id),
        score_snapshot_json TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_assessments_customer ON assessments(customer_id);
      CREATE INDEX idx_assessments_status ON assessments(status);

      CREATE TABLE control_assessments (
        id TEXT PRIMARY KEY,
        assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        control_id TEXT NOT NULL REFERENCES security_controls(id),
        status TEXT NOT NULL CHECK (status IN ('effective','partially_effective','ineffective','not_assessed','not_applicable')),
        score INTEGER,
        justification TEXT,
        evidence_notes TEXT,
        evidence_ref TEXT,
        assessed_at TEXT,
        assessed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (assessment_id, control_id)
      );
      CREATE INDEX idx_control_assessments_assessment ON control_assessments(assessment_id);

      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        finding_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        assessment_id TEXT REFERENCES assessments(id),
        asset TEXT,
        component TEXT,
        severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','informational')),
        priority TEXT NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
        priority_source TEXT NOT NULL DEFAULT 'calculated' CHECK (priority_source IN ('calculated','manual')),
        priority_justification TEXT,
        exploitability TEXT NOT NULL DEFAULT 'unknown',
        exposure TEXT NOT NULL DEFAULT 'unknown',
        business_impact TEXT NOT NULL DEFAULT 'unknown',
        compensating_controls TEXT,
        evidence TEXT,
        discovered_date TEXT NOT NULL,
        assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        recommended_remediation TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_verification','resolved','accepted_risk','false_positive')),
        target_date TEXT,
        resolution_notes TEXT,
        verification_evidence TEXT,
        resolved_at TEXT,
        external_ref TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_findings_customer ON findings(customer_id);
      CREATE INDEX idx_findings_assessment ON findings(assessment_id);
      CREATE INDEX idx_findings_status ON findings(status);
      CREATE INDEX idx_findings_severity ON findings(severity);
      CREATE INDEX idx_findings_target ON findings(target_date);

      CREATE TABLE finding_status_history (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        note TEXT,
        changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        changed_at TEXT NOT NULL
      );
      CREATE INDEX idx_status_history_finding ON finding_status_history(finding_id);

      CREATE TABLE remediation_activities (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_activities_finding ON remediation_activities(finding_id);

      CREATE TABLE risk_acceptances (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL UNIQUE REFERENCES findings(id) ON DELETE CASCADE,
        justification TEXT NOT NULL,
        decision_maker TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        review_date TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE reports (
        id TEXT PRIMARY KEY,
        report_key TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('executive','technical','remediation')),
        title TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        assessment_id TEXT REFERENCES assessments(id),
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','failed')),
        error_message TEXT,
        snapshot_json TEXT,
        generated_at TEXT NOT NULL,
        generated_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_reports_customer ON reports(customer_id);

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        actor_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        summary TEXT NOT NULL,
        metadata_json TEXT,
        ip TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_created ON audit_events(created_at DESC);
      CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE sequences (
        name TEXT PRIMARY KEY,
        next_value INTEGER NOT NULL DEFAULT 1
      );
    `,
  },
  {
    version: 2,
    name: 'client_portal_and_free_services',
    sql: `
      CREATE TABLE service_catalog (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        is_free INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        icon TEXT NOT NULL DEFAULT 'shield'
      );

      CREATE TABLE client_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE UNIQUE INDEX idx_client_users_email ON client_users(lower(email));

      CREATE TABLE client_sessions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_client_sessions_client ON client_sessions(client_id);
      CREATE INDEX idx_client_sessions_expiry ON client_sessions(expires_at);

      CREATE TABLE client_email_verifications (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_client_verifications_client ON client_email_verifications(client_id, created_at DESC);

      CREATE TABLE visitors (
        id TEXT PRIMARY KEY,
        cookie_id TEXT NOT NULL UNIQUE,
        ip_hash TEXT NOT NULL,
        fingerprint_hash TEXT,
        email TEXT,
        client_id TEXT REFERENCES client_users(id) ON DELETE SET NULL,
        free_service_used TEXT REFERENCES service_catalog(key),
        free_used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_visitors_ip ON visitors(ip_hash);
      CREATE INDEX idx_visitors_fingerprint ON visitors(fingerprint_hash);
      CREATE INDEX idx_visitors_email ON visitors(lower(email));
      CREATE INDEX idx_visitors_client ON visitors(client_id);

      CREATE TABLE free_service_runs (
        id TEXT PRIMARY KEY,
        visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        service_key TEXT NOT NULL REFERENCES service_catalog(key),
        target TEXT,
        consent_confirmed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
        score INTEGER,
        results_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_free_runs_visitor ON free_service_runs(visitor_id, created_at DESC);
      CREATE INDEX idx_free_runs_service ON free_service_runs(service_key);

      CREATE TABLE client_reports (
        id TEXT PRIMARY KEY,
        client_id TEXT REFERENCES client_users(id) ON DELETE SET NULL,
        visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        free_service_run_id TEXT NOT NULL UNIQUE REFERENCES free_service_runs(id) ON DELETE CASCADE,
        pdf_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_client_reports_client ON client_reports(client_id, created_at DESC);

      CREATE TABLE service_requests (
        id TEXT PRIMARY KEY,
        client_id TEXT REFERENCES client_users(id) ON DELETE SET NULL,
        visitor_id TEXT REFERENCES visitors(id) ON DELETE SET NULL,
        service_key TEXT NOT NULL REFERENCES service_catalog(key),
        message TEXT,
        contact_preference TEXT NOT NULL DEFAULT 'email' CHECK (contact_preference IN ('email','phone','whatsapp')),
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','in_progress','closed')),
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        staff_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_service_requests_client ON service_requests(client_id, created_at DESC);
      CREATE INDEX idx_service_requests_status ON service_requests(status, created_at DESC);
      CREATE INDEX idx_service_requests_assignee ON service_requests(assigned_to);
      CREATE UNIQUE INDEX idx_service_requests_open
        ON service_requests(client_id, service_key)
        WHERE client_id IS NOT NULL AND status IN ('new','contacted','in_progress');
    `,
  },
];

export async function runMigrations(db: Db): Promise<{ applied: number[] }> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied: number[] = [];
  const rows = await db.prepare('SELECT version FROM schema_migrations').all<{ version: string | number }>();
  const done = new Set(rows.map((r) => Number(r.version)));

  for (const m of migrations) {
    if (done.has(m.version)) continue;
    const tx = db.transaction(async () => {
      await db.exec(m.sql);
      await db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, new Date().toISOString());
    });
    await tx();
    applied.push(m.version);
  }
  return { applied };
}
