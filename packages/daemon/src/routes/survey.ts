import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ProjectNameSchema,
  SurveyAnswerInputSchema,
  SurveyCreateSchema,
  SurveyStartSchema,
} from '@cherry/shared';
import type { SurveyService } from '../survey/service.ts';

const IdParams = z.object({ id: ProjectNameSchema });

export function surveyRoutes(survey: SurveyService) {
  return (app: FastifyInstance) => {
    app.post('/api/survey', async (req) => survey.start(SurveyStartSchema.parse(req.body)));
    app.get('/api/survey/:id', async (req) => survey.state(IdParams.parse(req.params).id));
    app.post('/api/survey/:id/next', async (req) => {
      const { fresh } = z.object({ fresh: z.boolean().default(false) }).parse(req.body ?? {});
      return survey.next(IdParams.parse(req.params).id, fresh);
    });
    app.post('/api/survey/:id/answer', async (req) =>
      survey.answer(IdParams.parse(req.params).id, SurveyAnswerInputSchema.parse(req.body)),
    );
    app.post('/api/survey/:id/change', async (req) => {
      const { step } = z.object({ step: z.number().int().min(1).max(7) }).parse(req.body);
      return survey.change(IdParams.parse(req.params).id, step);
    });
    app.post('/api/survey/:id/create', async (req) =>
      survey.create(IdParams.parse(req.params).id, SurveyCreateSchema.parse(req.body)),
    );
  };
}
