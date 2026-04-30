import { useState } from "react";

interface MessageCellProps {
  text: string;
  maxLength?: number;
  onOpenDetail?: (text: string) => void;
}

export function MessageCell({ text, maxLength = 100, onOpenDetail }: Readonly<MessageCellProps>) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLength;

  return (
    <div className={`msg-cell${expanded ? " expanded" : ""}`}>
      <span className="msg-cell__text">
        {expanded || !needsTruncation ? text : `${text.slice(0, maxLength)}…`}
      </span>
      {needsTruncation && (
        <div className="msg-cell__actions">
          <button
            className="msg-cell__toggle"
            onClick={() => setExpanded((v) => !v)}
            type="button"
            aria-expanded={expanded}
          >
            {expanded ? "▲ Colapsar" : "▼ Expandir"}
          </button>
          {onOpenDetail && (
            <button
              className="msg-cell__toggle"
              onClick={() => onOpenDetail(text)}
              type="button"
            >
              Ver
            </button>
          )}
        </div>
      )}
    </div>
  );
}
