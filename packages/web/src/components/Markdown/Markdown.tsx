import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router';
import styles from './Markdown.module.css';

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** Turns "ADR-0003" in text into links (rendered as chips). */
function remarkAdrLinks() {
  const walk = (node: MdNode) => {
    if (
      !node.children ||
      node.type === 'link' ||
      node.type === 'inlineCode' ||
      node.type === 'code'
    )
      return;
    const out: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value && /ADR-\d{4}/.test(child.value)) {
        const parts = child.value.split(/(ADR-\d{4})/);
        for (const part of parts) {
          if (/^ADR-\d{4}$/.test(part))
            out.push({
              type: 'link',
              url: `adr:${part.slice(4)}`,
              children: [{ type: 'text', value: part }],
            });
          else if (part) out.push({ type: 'text', value: part });
        }
      } else {
        walk(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  return (tree: MdNode) => walk(tree);
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function joinPath(base: string, rel: string): string {
  const out = base ? base.split('/') : [];
  for (const part of rel.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

interface MarkdownProps {
  source: string;
  /** Path of this document inside the project (for relative links). */
  docPath?: string;
  /** Builds the in-app href for another project document. */
  docHref?(path: string): string;
  /** ADR number → document path, for ADR chips. */
  adrPath?(num: string): string | null;
  /** Smaller type for chat messages. */
  variant?: 'doc' | 'chat';
}

/**
 * Parsing Markdown is the costliest thing on the page, so a message re-renders only when its
 * text changes (not on every streamed chunk of another message).
 */
export const Markdown = memo(function Markdown({
  source,
  docPath = '',
  docHref = (p) => p,
  adrPath = () => null,
  variant = 'doc',
}: MarkdownProps) {
  const components: Components = {
    a({ href = '', children }) {
      if (href.startsWith('adr:')) {
        const target = adrPath(href.slice(4));
        return target ? (
          <Link to={docHref(target)} className={styles.adr}>
            {children}
          </Link>
        ) : (
          <span className={styles.adr} data-missing>
            {children}
          </span>
        );
      }
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) {
        return (
          <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer">
            {children}
          </a>
        );
      }
      const [file = ''] = href.split('#');
      const target = joinPath(dirname(docPath), decodeURIComponent(file));
      return <Link to={docHref(target)}>{children}</Link>;
    },
    input({ checked, type }) {
      return type === 'checkbox' ? (
        <input type="checkbox" checked={!!checked} disabled readOnly className={styles.check} />
      ) : null;
    },
  };

  return (
    <div className={styles.md} data-variant={variant}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkAdrLinks]}
        components={components}
        urlTransform={(url) => (url.startsWith('adr:') ? url : defaultUrlTransform(url))}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
