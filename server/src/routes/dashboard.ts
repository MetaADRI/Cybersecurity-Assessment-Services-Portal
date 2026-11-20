import { Router } from 'express';
import { wrap } from '../utils/async';
import { requireAuth } from '../middleware/auth';
import { countCustomers } from '../repositories/customers';
import { listAssessments } from '../repositories/assessments';
import { findingCounts, severityBreakdown, listFindings } from '../repositories/findings';

/**
 * Live dashboard aggregates. Every number here is computed from the database:
 * there are no hardcoded metrics.
 *
 * The average score only includes completed assessments, and the response
 * discloses how many assessments and how many distinct scopes it covers so the
 * UI can warn when the average mixes unrelated scopes.
 */
export function dashboardRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/summary',
    wrap(async (req, res) => {
      const db = req.db;
      const activeCustomers = await countCustomers(db, 'active');
      const archivedCustomers = await countCustomers(db, 'archived');
      const completed = await listAssessments(db, {
        page: 1,
        pageSize: 100,
        status: 'completed',
        dir: 'desc',
      });
      const counts = await findingCounts(db);
      const severities = await severityBreakdown(db);

      const scored = completed.items.filter((a) => a.overallScore !== null);
      const avg = scored.length
        ? Math.round(
            (scored.reduce((sum, a) => sum + (a.overallScore ?? 0), 0) / scored.length) * 10,
          ) / 10
        : null;
      const scopes = new Set(scored.map((a) => a.scope.trim().toLowerCase()));

      const recentAssessments = await listAssessments(db, { page: 1, pageSize: 6, dir: 'desc' });
      const topIssues = (
        await listFindings(db, {
          page: 1,
          pageSize: 5,
          dir: 'desc',
          sort: 'priority',
        })
      ).items.filter((f) => !['resolved', 'false_positive'].includes(f.status));

      const trend = await db
        .prepare(
          `SELECT assessment_key, title, assessment_date, overall_score, coverage_pct, scope
           FROM assessments WHERE status = 'completed' AND overall_score IS NOT NULL
           ORDER BY assessment_date ASC, completed_at ASC LIMIT 24`,
        )
        .all() as {
        assessment_key: string;
        title: string;
        assessment_date: string;
        overall_score: number;
        coverage_pct: number;
        scope: string;
      }[];

      const recentActivity = await db
        .prepare(
          `SELECT h.to_status, h.from_status, h.changed_at, h.note, f.finding_key, f.title AS finding_title, u.full_name AS actor
           FROM finding_status_history h
           JOIN findings f ON f.id = h.finding_id
           LEFT JOIN users u ON u.id = h.changed_by
           ORDER BY h.changed_at DESC LIMIT 8`,
        )
        .all() as Record<string, string | null>[];

      res.json({
        counts: {
          activeCustomers,
          archivedCustomers,
          completedAssessments: completed.total,
          averageScore: avg,
          averageScoreBasis: scored.length,
          averageScoreDistinctScopes: scopes.size,
          ...counts,
          severities,
        },
        trend: trend.map((t) => ({
          key: t.assessment_key,
          title: t.title,
          date: t.assessment_date,
          score: t.overall_score,
          coverage: t.coverage_pct,
          scope: t.scope,
        })),
        recentAssessments: recentAssessments.items,
        topIssues,
        recentActivity: recentActivity.map((a) => ({
          findingKey: a.finding_key,
          findingTitle: a.finding_title,
          from: a.from_status,
          to: a.to_status,
          at: a.changed_at,
          actor: a.actor,
          note: a.note,
        })),
        empty: activeCustomers === 0 && completed.total === 0 && counts.total === 0,
        generatedAt: new Date().toISOString(),
      });
    }),
  );

  return router;
}
