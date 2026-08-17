import type { ReactNode } from "react";

/**
 * Minimal Markdown renderer covering what the models actually emit here:
 * headings, bullet and numbered lists, bold, and inline code. Deliberately not
 * a full parser — it never renders raw HTML, so model output can't inject any.
 */
export default function Markdown({ text }: { text: string }) {
  return <div className="space-y-3">{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-[14.5px] leading-relaxed text-strong">
        {inline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l-${blocks.length}`}
        className={`space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-strong ${
          ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {items.map((item, i) => (
          <li key={i} className="pl-0.5">
            {inline(item)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className={
            level <= 2
              ? "pt-1 text-[13px] font-semibold uppercase tracking-wide text-subtle"
              : "pt-1 text-[14px] font-semibold text-strong"
          }
        >
          {inline(heading[2])}
        </h3>,
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    // A plain line continues the current list item if we're inside a list,
    // which is how wrapped bullets arrive.
    if (list) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/** Handles `**bold**`, `*italic*`, `` `code` `` and [mm:ss] timestamps. */
function inline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[\d{1,2}:\d{2}(?::\d{2})?\])/g;
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];

    if (token.startsWith("**")) {
      out.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={key++}
          className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      out.push(
        <span
          key={key++}
          className="font-mono text-[0.85em] tabular-nums text-subtle"
        >
          {token}
        </span>,
      );
    } else {
      out.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
