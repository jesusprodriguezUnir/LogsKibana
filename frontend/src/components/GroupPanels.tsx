// Paneles de presentación extraídos de App.tsx (sin lógica de datos).

export function SummaryMiniPanel({ title, entries }: { title: string; entries: [string, number][] }) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{title}</div>
      <ul style={{ listStyle: "none", marginTop: 4 }}>
        {entries.length === 0 && <li style={{ color: "var(--ink-faint)", fontSize: 12 }}>—</li>}
        {entries.map(([k, v]) => (
          <li key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, gap: 6 }}>
            <span title={k} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-muted)" }}>{k}</span>
            <strong style={{ flexShrink: 0, color: "var(--ink)" }}>{v}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GroupPanel({ field, values }: { field: string; values: Record<string, number> }) {
  const entries = Object.entries(values);
  const max = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 1;
  return (
    <div className="group-panel">
      <div className="group-panel__title">Por {field}</div>
      <ul>
        {entries.length === 0 && <li style={{ color: "var(--ink-faint)", fontSize: 12 }}>Sin datos</li>}
        {entries.map(([key, count]) => (
          <li key={key} style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="group-panel__key" title={key}>{key}</span>
              <span className="group-panel__count">{count}</span>
            </div>
            <div className="group-panel__bar" style={{ width: `${(count / max) * 100}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
