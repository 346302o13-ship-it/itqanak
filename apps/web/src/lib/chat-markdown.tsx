import type { ReactNode } from "react";

/**
 * `**bold**` spans only — split and wrap, never dangerouslySetInnerHTML, so
 * there is no HTML-injection surface even though this text came from a
 * model reply.
 */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={`${keyPrefix}-${index}`}>{part}</span>
      ),
    );
}

/**
 * The assistant is asked (system prompt) to format with plain text, **bold**,
 * and "- " bullet lines only — this renders exactly that lightweight subset,
 * so a reply never shows raw markdown characters in the chat bubble.
 */
export function renderMessageText(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul className="my-1 ms-5 list-disc space-y-0.5" key={`ul-${key}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInline(item, `li-${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  text.split("\n").forEach((line, index) => {
    const bulletMatch = /^[-*]\s+(.*)/.exec(line.trim());
    if (bulletMatch) {
      listItems.push(bulletMatch[1] ?? "");
      return;
    }
    flushList(String(index));
    if (line.trim().length === 0) {
      blocks.push(<div className="h-2" key={`gap-${index}`} />);
    } else {
      blocks.push(
        <p className="leading-6" key={`p-${index}`}>
          {renderInline(line, `p-${index}`)}
        </p>,
      );
    }
  });
  flushList("end");
  return blocks;
}
