import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ScanService } from '../scans/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const AgentParams = IdParams.extend({ agentId: z.string().min(1).max(60) });
const ReportParams = AgentParams.extend({ reportId: z.string().min(1).max(40) });

export function scanRoutes(scans: ScanService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/scans', async (req) => scans.list(IdParams.parse(req.params).id));
    app.post('/api/projects/:id/scans/:agentId/run', async (req) => {
      const p = AgentParams.parse(req.params);
      return scans.start(p.id, p.agentId);
    });
    app.post('/api/projects/:id/scans/:agentId/stop', async (req) => {
      const p = AgentParams.parse(req.params);
      await scans.stop(p.id, p.agentId);
      return { ok: true };
    });
    app.get('/api/projects/:id/reports/:agentId', async (req) => {
      const p = AgentParams.parse(req.params);
      return scans.reports(p.id, p.agentId);
    });
    app.get('/api/projects/:id/reports/:agentId/:reportId', async (req) => {
      const p = ReportParams.parse(req.params);
      return scans.report(p.id, p.agentId, p.reportId);
    });
  };
}
