import { useEffect, useState } from "react";
import { requestJson } from "../services/api";

interface QueueStat {
  name: string;
  messages: number;
  consumers: number;
  error?: string;
}

export default function RabbitConfig() {
  const [queues, setQueues] = useState<QueueStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueues = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<{ queues: QueueStat[] }>("/queues");
      setQueues(data.queues);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando las colas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, []);

  return (
    <div className="page">
      <section className="card">
        <div className="rabbit-header">
          <p className="card__title" style={{ margin: 0 }}>
            <span className="card__title-icon">⚙️</span>Configuración y Colas
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => void fetchQueues()} disabled={loading}>
            {loading ? "Cargando..." : "🔄 Refrescar Info"}
          </button>
        </div>
        
        {error && <div className="alert alert-error" style={{marginTop: 16}}>{error}</div>}

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Cola (Routing Key)</th>
                <th>Mensajes Pendientes</th>
                <th>Consumidores Activos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {queues.length === 0 && !loading && (
                <tr className="empty-row"><td colSpan={4}>No hay información de colas</td></tr>
              )}
              {queues.map((q) => (
                <tr key={q.name}>
                  <td><code className="mono" style={{ color: "var(--teal)", fontSize: 13 }}>{q.name}</code></td>
                  <td><strong style={{ color: q.messages > 0 ? "var(--accent)" : "inherit" }}>{q.messages}</strong></td>
                  <td>{q.consumers}</td>
                  <td>
                    {q.error ? (
                      <span className="level-badge error" title={q.error}>🚫 Inactiva</span>
                    ) : (
                      <span className="level-badge info">✅ OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
