/**
 * Converts common Markdown patterns to Telegram-compatible HTML.
 *
 * Telegram's HTML mode supports: <b>, <i>, <s>, <u>, <code>, <pre>,
 * <a href="...">, <tg-spoiler>, <blockquote>.
 *
 * This handles the most common patterns that AI responses produce:
 * headings, bold, italic, code blocks, inline code, links, lists,
 * and horizontal rules.
 */

/** Escape characters that are special in HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownToTelegramHtml(md: string): string {
  // 1. Extract fenced code blocks so they aren't mangled by later rules.
  //    Replace them with placeholders and restore at the end.
  const codeBlocks: string[] = [];
  let text = md.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre>${escapeHtml(code.replace(/\n$/, ""))}</pre>`);
    return `\x00CODEBLOCK_${idx}\x00`;
  });

  // 2. Extract inline code spans before escaping HTML.
  const inlineCode: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const idx = inlineCode.length;
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE_${idx}\x00`;
  });

  // 3. Now escape HTML entities in the remaining text.
  text = escapeHtml(text);

  // 4. Headings (## Heading) → bold text
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // 5. Bold (**text** or __text__)
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");

  // 6. Italic (*text* or _text_) — but avoid matching list bullets or
  //    underscores inside words.
  //    Only match *text* when not preceded by a word char (to avoid mid-word).
  text = text.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  text = text.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");

  // 7. Strikethrough ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // 8. Links [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // 9. Horizontal rules (--- or ***) → thin unicode line
  text = text.replace(/^[\s]*([-*_]){3,}[\s]*$/gm, "─────────────────────────");

  // 10. Unordered list bullets: leading "- " or "* " → "•"
  text = text.replace(/^(\s*)[-*]\s+/gm, "$1• ");

  // 11. Restore inline code
  text = text.replace(/\x00INLINE_(\d+)\x00/g, (_m, idx) => inlineCode[parseInt(idx)]);

  // 12. Restore code blocks
  text = text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_m, idx) => codeBlocks[parseInt(idx)]);

  return text;
}
