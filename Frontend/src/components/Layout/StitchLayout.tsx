import React from 'react';
import '../../styles/stitch.scoped.css';

const StitchLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BACKEND_BASE_URL}/api/v1`
    : '/api/v1';

  return (
    <div className="stitch-app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Adminiculum</p>
          <h1>Ügyvezető tábla</h1>
          <p className="sub">Teljesen a backend valóságára építő, magyar nyelvű áttekintés.</p>
        </div>
      </header>

      <section className="connection-panel card">
        <div>
          <h2>Kapcsolódás</h2>
          <p className="muted">
            A `GET /cases`, `GET /cases/dashboard/stats`, `GET /cases/:id/summary`,
            `GET /tasks/cases/:id/tasks` és `GET /documents/case/:id` végpontok szolgáltatják az adatokat.
          </p>
        </div>
        <div className="fields">
          <label>
            API alap URL
            <input id="api-base" placeholder="http://localhost:3001/api/v1" value={apiBaseUrl} readOnly />
          </label>
          <label>
            JWT token
            <textarea id="auth-token" placeholder="Bearer token (pl. /auth/login)" rows={2} readOnly value="Dev bypass aktív" />
          </label>
          <input type="hidden" id="case-id" />
          <div className="actions">
            <button id="save-config" className="btn">
              Kapcsolódás mentése
            </button>
            <button id="test-connection" className="btn secondary">
              Kapcsolat tesztelése
            </button>
            <button id="clear-config" className="btn ghost">
              Token törlése
            </button>
          </div>
        </div>
      </section>

      <div className="shell">
        <aside className="nav-card card">
          <h2>Fő nézetek</h2>
          <nav>
            <button className="nav-link active" data-section="cases">
              Ügyek
            </button>
            <button className="nav-link" disabled title="TODO: hitelesített timeline és naptár végpont hiányában nem aktív">
              Határidők &amp; naptár (TODO)
            </button>
            <button className="nav-link" disabled title="Kommunikációs végpont jelenleg nem elérhető">
              Kommunikáció (TODO)
            </button>
            <button className="nav-link" disabled title="Szerződésgenerálás sablonok és preview jelenleg backlogból jöhet">
              Szerződésgenerálás (TODO)
            </button>
          </nav>
        </aside>

        <main className="content">{children}</main>
      </div>
    </div>
  );
};

export default StitchLayout;
