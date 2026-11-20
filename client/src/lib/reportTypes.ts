/** Client-side mirror of the server's ReportContent structure (server/src/reports/content.ts). */

export type ReportBlock =
  | { kind: 'heading'; text: string; level: 1 | 2 | 3 }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; align?: ('left' | 'right')[] }
  | {
      kind: 'chart';
      title: string;
      data: { label: string; value: number }[];
      max: number;
      unit: string;
    }
  | { kind: 'kv'; pairs: [string, string][] }
  | { kind: 'pagebreak' };

export interface ReportContent {
  reportKey: string;
  type: string;
  title: string;
  classification: string;
  organization: string;
  generatedAt: string;
  generatedByName: string | null;
  customer: { name: string; industry: string; scope: string | null; contactName: string | null };
  assessment: {
    key: string;
    title: string;
    type: string;
    date: string;
    assessor: string;
    status: string;
    scope: string;
    fromSnapshot: boolean;
  };
  score: {
    overallScore: number | null;
    coveragePct: number;
    eligible: boolean;
    provisional: boolean;
    methodologyVersion: number;
    eligibilityReasons: string[];
    categories: { name: string; weight: number; score: number | null }[];
  } | null;
  limitations: string[];
  blocks: ReportBlock[];
}
