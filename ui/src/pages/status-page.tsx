import { useHealth } from '../hooks/use-health';
import './status-page.css';

export function StatusPage() {
  const { data, error, loading, refetch } = useHealth();

  return (
    <div className="status-page">
      <h1>bench</h1>
      <p className="subtitle">ComfyUI Workflow Manager</p>

      <div className="status-card">
        <h2>API Status</h2>

        {loading && <p className="status-loading">Checking...</p>}

        {error && (
          <div className="status-error">
            <span className="status-indicator status-down" />
            <span>Offline</span>
            <p className="error-detail">{error}</p>
          </div>
        )}

        {data && (
          <div className="status-ok">
            <span className="status-indicator status-up" />
            <span>Online</span>
            <dl className="status-details">
              <dt>Status</dt>
              <dd>{data.status}</dd>
              <dt>Version</dt>
              <dd>{data.version}</dd>
            </dl>
          </div>
        )}

        <button className="refresh-btn" onClick={refetch} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
