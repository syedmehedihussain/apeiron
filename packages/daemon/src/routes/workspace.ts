import { statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TaskStatusSchema,
  TasksFileSchema,
  type ProjectDetail,
  type TasksFile,
} from '@apeiron/shared';
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from '../fsutil.ts';
import { gitStatus } from '../git.ts';
import { conflict, notFound } from '../http.ts';
import type { ConfigStore } from '../config.ts';
import { resolveInside } from '../paths.ts';
import { openInEditor } from '../projects/editor.ts';
import type { GitInfoService } from '../projects/github.ts';
import { buildCard, readProjectFiles } from '../projects/scanner.ts';
import { fileDiff, listDocs, listTree, projectDir, readFileView } from '../projects/workspace.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const PathQuery = z.object({ path: z.string().max(4096).default('') });

export function workspaceRoutes(config: ConfigStore, gitInfo: GitInfoService) {
  return (app: FastifyInstance) => {
    const dirOf = (params: unknown) => projectDir(config.projectsDir(), IdParams.parse(params).id);

    app.get('/api/projects/:id', async (req): Promise<ProjectDetail> => {
      const dir = dirOf(req.params);
      const files = readProjectFiles(dir);
      const statusFile = path.join(dir, '_project', 'STATUS.md');
      const statusMtime = existsSync(statusFile) ? statSync(statusFile).mtimeMs : null;
      return {
        card: await buildCard(dir),
        projectJson: files.projectJson,
        status: files.status,
        statusMtime,
      };
    });

    app.get('/api/projects/:id/tree', async (req) =>
      listTree(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    app.get('/api/projects/:id/file', async (req) =>
      readFileView(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    app.get('/api/projects/:id/diff', async (req) =>
      fileDiff(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    app.get('/api/projects/:id/docs', async (req) => listDocs(dirOf(req.params)));

    app.get('/api/projects/:id/git', async (req) => gitInfo.get(dirOf(req.params)));

    app.get('/api/projects/:id/changes', async (req) => {
      const status = await gitStatus(dirOf(req.params));
      return {
        entries: (status?.entries ?? []).map((e) => ({
          path: e.path.replace(/\/$/, ''),
          letter: e.letter,
        })),
      };
    });

    // Notes: the only file the UI writes directly (the user's own notes, docs/api.md).
    app.get('/api/projects/:id/notes', async (req) => {
      const file = path.join(dirOf(req.params), '_project', 'notes.md');
      if (!existsSync(file)) return { content: '', mtime: null };
      return { content: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs };
    });

    app.put('/api/projects/:id/notes', async (req) => {
      const body = z
        .object({ content: z.string().max(1_000_000), baseMtime: z.number().nullable() })
        .parse(req.body);
      const file = path.join(dirOf(req.params), '_project', 'notes.md');
      const current = existsSync(file) ? statSync(file).mtimeMs : null;
      if (current !== null && body.baseMtime !== null && Math.abs(current - body.baseMtime) > 1) {
        throw conflict(
          'notes.md changed on disk since you opened it. Reload to see the new version.',
        );
      }
      writeFileAtomic(file, body.content);
      return { content: body.content, mtime: statSync(file).mtimeMs };
    });

    app.get('/api/projects/:id/tasks', async (req): Promise<TasksFile> => {
      const file = path.join(dirOf(req.params), '_project', 'tasks.json');
      if (!existsSync(file)) return { schema: 1, tasks: [] };
      return TasksFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    });

    app.patch('/api/projects/:id/tasks/:taskId', async (req) => {
      const { taskId } = z.object({ taskId: z.string() }).parse(req.params);
      const { status } = z.object({ status: TaskStatusSchema }).parse(req.body);
      const file = path.join(dirOf(req.params), '_project', 'tasks.json');
      if (!existsSync(file)) throw notFound('This project has no tasks.json');
      const tasks = TasksFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const task = tasks.tasks.find((t) => t.id === taskId);
      if (!task) throw notFound(`No task ${taskId}`);
      task.status = status;
      writeFileAtomic(file, JSON.stringify(tasks, null, 2) + '\n');
      return tasks;
    });

    app.post('/api/projects/:id/open-in-editor', async (req) => {
      const dir = dirOf(req.params);
      const { path: rel } = z
        .object({ path: z.string().max(4096).default('') })
        .parse(req.body ?? {});
      const target = resolveInside(dir, rel);
      return { ok: true, via: await openInEditor(target) };
    });
  };
}
