import { Router } from 'express';
import { z } from 'zod';
import { serviceRequestUpdateSchema } from '../../../shared/client-schemas';
import { validateBody } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireWriter } from '../middleware/auth';
import {
  getStaffRequest,
  listAssignableStaff,
  listStaffRequests,
  updateStaffRequest,
} from '../repositories/service-requests';
import { recordAudit } from '../repositories/audit';
import { NotFoundError, ValidationError } from '../utils/errors';

export function serviceRequestsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    wrap(async (req, res) => {
      res.json({ items: await listStaffRequests(req.db) });
    }),
  );

  router.get(
    '/assignees',
    wrap(async (req, res) => {
      res.json({ items: await listAssignableStaff(req.db) });
    }),
  );

  router.patch(
    '/:id',
    requireWriter,
    validateBody(serviceRequestUpdateSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof serviceRequestUpdateSchema>;
      const existing = await getStaffRequest(req.db, req.params.id);
      if (!existing) throw new NotFoundError('Service request not found');
      if (body.assignedTo !== undefined && body.assignedTo !== null) {
        const assignable = (await listAssignableStaff(req.db)).some(
          (user) => user.id === body.assignedTo,
        );
        if (!assignable) throw new ValidationError('Choose an active administrator or analyst');
      }
      const updated = await updateStaffRequest(req.db, existing.id, {
        status: body.status,
        assignedTo: body.assignedTo,
        staffNote: body.staffNote,
      });
      if (!updated) throw new NotFoundError('Service request not found');
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'service_request.updated',
        entityType: 'service_request',
        entityId: updated.id,
        summary: `Updated service request for ${updated.serviceName}`,
        metadata: {
          status: body.status,
          assignedTo: body.assignedTo,
          noteChanged: body.staffNote !== undefined,
        },
      });
      res.json({ request: updated });
    }),
  );

  return router;
}
