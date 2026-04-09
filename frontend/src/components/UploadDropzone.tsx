import { useRef, useState, type DragEvent, type ChangeEvent } from "react";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  loading?: boolean;
  sessionId?: string;
  rowCount?: number;
}

export function UploadDropzone({ onFile, loading = false, sessionId, rowCount }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name.toLowerCase().endsWith(".csv")) {
      setFileName(file.name);
      onFile(file);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFile(file);
    }
  };

  return (
    <div
      className={`dropzone${dragOver ? " drag-over" : ""}${fileName ? " has-file" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      aria-label="Área de carga de CSV"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="dropzone__input"
        onChange={handleChange}
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="dropzone__icon">
        {loading ? "⏳" : fileName ? "✅" : "📂"}
      </div>
      <div className="dropzone__title">
        {loading
          ? "Procesando CSV…"
          : fileName
          ? fileName
          : "Arrastra tu CSV aquí o haz clic para seleccionar"}
      </div>
      <div className="dropzone__subtitle">
        {fileName ? `${rowCount != null ? `${rowCount} filas cargadas` : "Cargado"}` : "Formato: .csv exportado desde Kibana"}
      </div>
      {sessionId && (
        <div className="session-badge">
          <span>🔑</span>
          <span>Sesión: {sessionId.slice(0, 8)}…</span>
        </div>
      )}
    </div>
  );
}
