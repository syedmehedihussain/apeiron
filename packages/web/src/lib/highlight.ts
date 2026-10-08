import type { HighlighterGeneric, ThemedToken } from 'shiki';

let highlighter: Promise<HighlighterGeneric<string, string>> | null = null;
const THEME = 'github-dark-default';

async function getHighlighter() {
  highlighter ??= import('shiki').then(
    ({ createHighlighter }) =>
      createHighlighter({ themes: [THEME], langs: [] }) as Promise<
        HighlighterGeneric<string, string>
      >,
  );
  return highlighter;
}

/** Colour tokens per line. Falls back to plain text for unknown languages. */
export async function highlightLines(code: string, lang: string): Promise<ThemedToken[][] | null> {
  if (lang === 'text' || code.length > 400_000) return null;
  try {
    const h = await getHighlighter();
    if (!h.getLoadedLanguages().includes(lang)) await h.loadLanguage(lang as never);
    return h.codeToTokensBase(code, { lang, theme: THEME });
  } catch {
    return null;
  }
}
