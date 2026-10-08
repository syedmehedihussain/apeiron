import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CalibrateWriteSchema } from '@apeiron/shared';
import type { CalibrationService } from '../calibrate/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function calibrateRoutes(calibration: CalibrationService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/calibrate', async (req) =>
      calibration.state(IdParams.parse(req.params).id),
    );
    app.post('/api/projects/:id/calibrate', async (req) => {
      const { model } = z
        .object({ model: z.enum(['sonnet', 'opus', 'haiku']).optional() })
        .parse(req.body ?? {});
      return calibration.start(IdParams.parse(req.params).id, model);
    });
    app.post('/api/projects/:id/calibrate/cancel', async (req) =>
      calibration.cancel(IdParams.parse(req.params).id),
    );
    app.post('/api/projects/:id/calibrate/write', async (req) =>
      calibration.write(IdParams.parse(req.params).id, CalibrateWriteSchema.parse(req.body).paths),
    );
  };
}
