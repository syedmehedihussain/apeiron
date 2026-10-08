import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Health } from '@apeiron/shared';
import { AuthStore, newCliSecret } from './auth.ts';
import { ConfigStore } from './config.ts';
import { openDb, type Db } from './db.ts';
import { EventHub } from './events.ts';
import { HealthService } from './health-service.ts';
import { ensureMagnetFiles } from './magnet/files.ts';
import { GitInfoService } from './projects/github.ts';
import { ProjectService } from './projects/service.ts';
import { workspaceRoutes } from './routes/workspace.ts';
import { chatRoutes } from './routes/chat.ts';
import { calibrateRoutes } from './routes/calibrate.ts';
import { CalibrationService } from './calibrate/service.ts';
import { surveyRoutes } from './routes/survey.ts';
import { gitRoutes } from './routes/git.ts';
import { agentRoutes } from './routes/agents.ts';
import { AgentManager } from './agents/manager.ts';
import { GitActions, type PrLister } from './projects/git-actions.ts';
import { SurveyService, ghCli, type SurveyGitHub } from './survey/service.ts';
import { ChatService } from './chat/service.ts';
import { ApprovalBroker } from './claude/approvals.ts';
import { DecisionBroker } from './claude/decisions.ts';
import { sdkRunner, type Runner } from './claude/runner.ts';
import { buildServer } from './server.ts';
import { watchProjects } from './watcher.ts';
import pkg from '../package.json' with { type: 'json' };

export interface Daemon {
  app: FastifyInstance;
  config: ConfigStore;
  auth: AuthStore;
  hub: EventHub;
  db: Db;
  chat: ChatService;
  approvals: ApprovalBroker;
  decisions: DecisionBroker;
  calibration: CalibrationService;
  survey: SurveyService;
  agents: AgentManager;
  projects: ProjectService;
  health: HealthService;
  cliSecret: string;
  close(): Promise<void>;
}

export interface DaemonOptions {
  home: string;
  /** Port the daemon listens on; used to build the allowed origins. */
  port: number;
  /** Extra allowed UI origins (the Vite dev server). */
  extraOrigins?: string[];
  /** Watch the projects folder for changes (off in unit tests). */
  watch?: boolean;
  /** Use an in-memory database (tests). */
  memoryDb?: boolean;
  /** Replace the real tool checks (tests). */
  healthCheck?: () => Promise<Health>;
  /** Replace the Claude runner (tests use the fake Claude). */
  runner?: Runner;
  /** Replace gh for the survey's "Create a private GitHub repository" (tests). */
  github?: SurveyGitHub;
  /** Replace `gh pr list` (tests). */
  prList?: PrLister;
}

const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createDaemon(opts: DaemonOptions): Daemon {
  const config = new ConfigStore(opts.home);
  ensureMagnetFiles(opts.home);
  const db = openDb(opts.memoryDb ? ':memory:' : path.join(opts.home, 'cache.db'));
  const hub = new EventHub();
  const auth = new AuthStore(opts.home);
  const health = new HealthService(pkg.version, config, hub, opts.healthCheck);
  const projects = new ProjectService(config, db, hub, opts.home);
  const cliSecret = newCliSecret();
  const gitInfo = new GitInfoService();
  const approvals = new ApprovalBroker(db, hub);
  const decisions = new DecisionBroker();
  const chat = new ChatService(
    config,
    db,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    opts.home,
  );
  const calibration = new CalibrationService(
    config,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    projects,
    opts.home,
  );

  const survey = new SurveyService(
    config,
    hub,
    opts.runner ?? sdkRunner,
    projects,
    opts.github ?? ghCli,
  );

  const agents = new AgentManager(
    config,
    db,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    opts.home,
  );
  const gitActions = new GitActions(config, hub, approvals, gitInfo, opts.prList);

  const app = buildServer({
    version: pkg.version,
    config,
    auth,
    hub,
    health,
    projects,
    cliSecret,
    origins: [`http://127.0.0.1:${opts.port}`, ...(opts.extraOrigins ?? [])],
    webDist: WEB_DIST,
    routes: [
      workspaceRoutes(config, gitInfo),
      chatRoutes(chat, approvals, decisions),
      calibrateRoutes(calibration),
      surveyRoutes(survey),
      gitRoutes(gitActions),
      agentRoutes(agents),
    ],
  });

  const watcher = opts.watch
    ? watchProjects(config.projectsDir(), (ids) => {
        void projects.rescan();
        for (const id of ids) {
          hub.publish(`project:${id}`, 'project.changed', { projectId: id, paths: [] });
        }
      })
    : null;

  return {
    app,
    config,
    auth,
    hub,
    db,
    projects,
    health,
    cliSecret,
    chat,
    approvals,
    decisions,
    calibration,
    survey,
    agents,
    async close() {
      await chat.stopAll();
      await survey.stopAll();
      await agents.stopAll();
      approvals.cancel(undefined, 'Apeiron restarted');
      await watcher?.close();
      await app.close();
      db.close();
    },
  };
}
