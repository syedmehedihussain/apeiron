import { z } from 'zod';
import { ProjectCardSchema, ProjectJsonSchema, StatusDocSchema } from './project.ts';

export const GitLetterSchema = z.enum(['M', 'A', 'D', 'U', 'R']);
export type GitLetter = z.infer<typeof GitLetterSchema>;

export const TreeEntrySchema = z.object({
  name: z.string(),
  /** Path relative to the project root, with `/` separators. */
  path: z.string(),
  type: z.enum(['dir', 'file']),
  /** Short type tag for files: TS, MD, JSON … */
  tag: z.string().nullable(),
  git: GitLetterSchema.nullable(),
  /** Folders like node_modules: shown dimmed, never walked. */
  ignored: z.boolean(),
  /** For folders: how many changed files are inside. */
  changedInside: z.number().int(),
});
export type TreeEntry = z.infer<typeof TreeEntrySchema>;

export const TreeSchema = z.object({ path: z.string(), entries: z.array(TreeEntrySchema) });
export type Tree = z.infer<typeof TreeSchema>;

export const FileViewSchema = z.object({
  path: z.string(),
  language: z.string(),
  size: z.number(),
  lines: z.number(),
  content: z.string(),
  truncated: z.boolean(),
  /** Secret files (.env, keys) are never sent. */
  hidden: z.boolean(),
  binary: z.boolean(),
  mtime: z.number(),
  git: GitLetterSchema.nullable(),
});
export type FileView = z.infer<typeof FileViewSchema>;

export const DiffLineSchema = z.object({
  kind: z.enum([' ', '+', '-']),
  /** Line number in the old file (HEAD), null for added lines. */
  a: z.number().nullable(),
  /** Line number in the new file, null for removed lines. */
  b: z.number().nullable(),
  text: z.string(),
});
export type DiffLine = z.infer<typeof DiffLineSchema>;

export const FileDiffSchema = z.object({
  path: z.string(),
  added: z.number(),
  removed: z.number(),
  /** The whole file with removed lines shown inline. Empty when unchanged. */
  lines: z.array(DiffLineSchema),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const DocItemSchema = z.object({
  path: z.string(),
  title: z.string(),
  /** Short mono label: MD, PRD, ARC, DM, or the ADR number. */
  tag: z.string(),
  mtime: z.number(),
});
export type DocItem = z.infer<typeof DocItemSchema>;

export const DocsListSchema = z.object({
  project: z.array(DocItemSchema),
  engineering: z.array(DocItemSchema),
  decisions: z.array(DocItemSchema),
});
export type DocsList = z.infer<typeof DocsListSchema>;

export const ProjectDetailSchema = z.object({
  card: ProjectCardSchema,
  projectJson: ProjectJsonSchema.nullable(),
  status: StatusDocSchema.nullable(),
  /** STATUS.md modified time, for "Updated 2 h ago". */
  statusMtime: z.number().nullable(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const CommitSchema = z.object({ hash: z.string(), subject: z.string(), time: z.number() });

export const GitInfoSchema = z.object({
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  changes: z.number(),
  remote: z.boolean(),
  commits: z.array(CommitSchema),
  /** owner/name on GitHub, when `gh` knows the repo. */
  repo: z.string().nullable(),
  url: z.string().nullable(),
  visibility: z.enum(['public', 'private', 'internal']).nullable(),
  openPRs: z.number().nullable(),
});
export type GitInfo = z.infer<typeof GitInfoSchema>;

export const ChangesSchema = z.object({
  entries: z.array(z.object({ path: z.string(), letter: GitLetterSchema })),
});
export type Changes = z.infer<typeof ChangesSchema>;

export const TaskStatusSchema = z.enum(['todo', 'doing', 'done', 'skipped']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** `_project/tasks.json` (docs/data-model.md §4). */
export const TasksFileSchema = z.object({
  schema: z.literal(1),
  tasks: z.array(
    z.object({
      id: z.string(),
      phase: z.enum(['plan', 'design', 'preparation', 'development', 'deployment']),
      title: z.string(),
      status: TaskStatusSchema,
      dependsOn: z.array(z.string()).default([]),
    }),
  ),
});
export type TasksFile = z.infer<typeof TasksFileSchema>;
export type Task = TasksFile['tasks'][number];

export const NotesSchema = z.object({ content: z.string(), mtime: z.number().nullable() });
export type Notes = z.infer<typeof NotesSchema>;
