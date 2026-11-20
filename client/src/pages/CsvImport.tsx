import { useState } from 'react';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  Select,
  Spinner,
} from '../components/ui';
import { formatApiError, useApi } from '../hooks/useApi';
import { api, type Paginated } from '../lib/api';
import { apiUrl } from '../lib/config';
import { canWrite, useAuth } from '../auth';
import { label } from '../lib/format';
import type { Assessment, Customer } from '../../../shared/types';

interface PreviewRow {
  rowNumber: number;
  values: Record<string, string>;
}

interface PreviewResponse {
  headers: string[];
  rows: PreviewRow[];
  errors: { row: number; message: string }[];
  duplicates: { row: number; key: string }[];
}

export default function CsvImport() {
  const { user } = useAuth();
  const writable = canWrite(user);
  const customers = useApi<Paginated<Customer>>('/customers?pageSize=100&status=active');
  const [customerId, setCustomerId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const assessments = useApi<Paginated<Assessment>>(
    customerId ? `/assessments?customerId=${customerId}&pageSize=50` : null,
  );

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api<PreviewResponse>('/import/preview', {
        method: 'POST',
        body: { csv: text, customerId, assessmentId: assessmentId || null },
      });
      setPreview(response);
    } catch (err) {
      setError(formatApiError(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ imported: number }>('/import/commit', {
        method: 'POST',
        body: {
          csv: text,
          customerId,
          assessmentId: assessmentId || null,
          skippedRows: [],
          confirmed: true,
        },
      });
      setResult(
        `${response.imported} finding(s) imported. Everything is validated before any row is written.`,
      );
      setPreview(null);
      setText('');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="CSV import and export"
        subtitle="Import validated findings. Importing a file is not the same as running a vulnerability scan."
      />

      {!writable && (
        <div className="mb-4">
          <Notice tone="info">
            Read-only reviewers cannot import findings, but they can download exports.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="1. Prepare your file"
          description="Download the template and keep the required column headers"
        >
          <ul className="list-disc pl-5 text-sm text-slate-600">
            <li>Required columns: title, description, severity, customer_id</li>
            <li>
              Optional: asset, component, discovered_date, target_date, external_ref,
              recommended_remediation, assignee_email
            </li>
            <li>
              Dates use YYYY-MM-DD. Severity must be critical, high, medium, low or informational.
            </li>
            <li>Duplicate titles for the same customer are skipped rather than imported twice.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <a href={apiUrl('/import/template')}>
              <Button variant="secondary">Download template</Button>
            </a>
            <a href={apiUrl('/findings/export')}>
              <Button variant="secondary">Export current findings</Button>
            </a>
          </div>
        </Card>

        <Card title="2. Choose target">
          <div className="space-y-4">
            <Field label="Customer" htmlFor="csv-customer" required>
              <Select
                id="csv-customer"
                value={customerId}
                disabled={!writable}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setAssessmentId('');
                }}
              >
                <option value="">Select a customer</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link to assessment (optional)" htmlFor="csv-assessment">
              <Select
                id="csv-assessment"
                value={assessmentId}
                disabled={!writable}
                onChange={(e) => setAssessmentId(e.target.value)}
              >
                <option value="">Not linked</option>
                {assessments.data?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assessmentKey} - {a.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paste CSV content" htmlFor="csv-text" required>
              <textarea
                id="csv-text"
                rows={10}
                disabled={!writable}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="title,description,severity,customer_id,..."
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={runPreview}
                loading={busy}
                disabled={!writable || !text.trim() || !customerId}
              >
                Preview rows
              </Button>
              {preview && preview.errors.length === 0 && (
                <Button variant="primary" onClick={commit} loading={busy}>
                  Import {preview.rows.length} row(s)
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {error && (
        <div className="mt-5">
          <ErrorState message={error} />
        </div>
      )}
      {result && (
        <div className="mt-5">
          <Notice tone="success">{result}</Notice>
        </div>
      )}

      {busy && <Spinner label="Working" />}

      {preview && (
        <div className="mt-5 space-y-4">
          {preview.errors.length > 0 && (
            <Notice tone="danger">
              <p className="font-medium">
                The file has {preview.errors.length} problem(s) and cannot be imported yet
              </p>
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          {preview.duplicates.length > 0 && (
            <Notice tone="warning">
              {preview.duplicates.length} row(s) match an existing finding title and will be
              skipped: {preview.duplicates.map((d) => `row ${d.row}`).join(', ')}
            </Notice>
          )}

          {preview.rows.length === 0 && preview.errors.length === 0 ? (
            <EmptyState
              title="Nothing to import"
              description="No valid new rows were found in the file."
            />
          ) : (
            <Card title={`Preview - ${preview.rows.length} row(s) ready`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Row</th>
                      <th className="py-2 pr-3">Title</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2 pr-3">Discovered</th>
                      <th className="py-2">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.slice(0, 50).map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="py-2 pr-3 text-slate-500">{row.rowNumber}</td>
                        <td className="py-2 pr-3 text-slate-800">{row.values.title}</td>
                        <td className="py-2 pr-3">{label(row.values.severity)}</td>
                        <td className="py-2 pr-3">{row.values.asset}</td>
                        <td className="py-2 pr-3">{row.values.discovered_date}</td>
                        <td className="py-2">{row.values.target_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 50 && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the first 50 rows of {preview.rows.length}.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
