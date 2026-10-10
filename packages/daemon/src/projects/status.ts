import type { StatusDoc } from '@cherry/shared';

/** Splits `---` front matter (simple `key: value` lines) from the Markdown body. */
export function frontMatter(md: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { fields: {}, body: md };
  const fields: Record<string, string> = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv?.[1]) fields[kv[1]] = (kv[2] ?? '').replace(/\s+#.*$/, '').trim();
  }
  return { fields, body: md.slice(m[0].length) };
}

/** `## Heading` → section text, keyed by lower-cased heading. */
function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let key: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (key !== null) out.set(key, lines.join('\n').trim());
  };
  for (const line of body.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h?.[1]) {
      flush();
      key = h[1].toLowerCase();
      lines = [];
    } else if (key !== null) {
      lines.push(line);
    }
  }
  flush();
  return out;
}

function firstParagraph(text: string | undefined): string | null {
  if (!text) return null;
  const para = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .find((p) => p.length > 0 && !p.startsWith('_Updated'));
  return para ?? null;
}

/**
 * Parses `_project/STATUS.md`. Handles both cctop formats: with front matter (name, summary,
 * updated) and the older one with `_Updated: …_` at the end.
 */
export function parseStatusMd(md: string): StatusDoc {
  const { fields, body } = frontMatter(md);
  const secs = sections(body);

  const nextSteps: StatusDoc['nextSteps'] = [];
  for (const line of (secs.get('next steps') ?? '').split('\n')) {
    const item = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (item?.[2]) nextSteps.push({ text: item[2].trim(), done: item[1] !== ' ' });
    else {
      const plain = /^\s*[-*]\s+(.+)$/.exec(line);
      if (plain?.[1]) nextSteps.push({ text: plain[1].trim(), done: false });
    }
  }

  const doneRecently = (secs.get('done recently') ?? '')
    .split('\n')
    .map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((l): l is string => !!l);

  const updatedFooter = /_Updated:\s*([^_]+)_/.exec(body)?.[1]?.trim();

  return {
    summary: fields.summary || null,
    leftOff: firstParagraph(secs.get('where we left off')),
    nextSteps,
    doneRecently,
    updated: fields.updated || updatedFooter || null,
  };
}

export function firstOpenStep(status: StatusDoc): string | null {
  return status.nextSteps.find((s) => !s.done)?.text ?? null;
}
