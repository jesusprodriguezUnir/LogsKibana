import { useEffect, useState } from "react";

/** Modal de detalle del campo `message`, con copia al portapapeles. */
export function MessageModal({ message, onClose }: { message: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de message"
      tabIndex={-1}
    >
      <div className="modal message-modal">
        <div className="modal__header">
          <span className="modal__title">Detalle de message</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void copyMessage()}>
              Copiar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
        {copied && <div className="copied-toast" style={{ marginBottom: 10 }}>Copiado</div>}
        <pre className="message-modal__content">{message}</pre>
      </div>
    </div>
  );
}
