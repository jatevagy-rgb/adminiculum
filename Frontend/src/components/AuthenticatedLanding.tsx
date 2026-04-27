"use client";

type AuthenticatedLandingProps = {
  profile: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  onSignOut: () => void;
};

export function AuthenticatedLanding({ profile, onSignOut }: AuthenticatedLandingProps) {
  return (
    <div style={{ minHeight: "100vh", background: "#faf8f5", color: "#2d2a26", padding: "48px" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", display: "grid", gap: "24px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
          <div>
            <div style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: "11px", color: "#7a746b", marginBottom: "12px" }}>
              Authenticated workspace
            </div>
            <h1 style={{ margin: 0, fontSize: "42px", lineHeight: 1.05, fontFamily: "Georgia, 'Times New Roman', serif" }}>
              Adminiculum session restored
            </h1>
            <p style={{ color: "#6b655b", maxWidth: "700px", lineHeight: 1.7 }}>
              Microsoft authentication and backend bootstrap completed. The recovered historical workspace shell is still being consolidated with the preserved domain modules, so this temporary authenticated landing keeps the login flow testable without exposing the abandoned Vite UI.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            style={{ border: "1px solid #d7d0c3", background: "white", color: "#2d2a26", padding: "12px 16px", cursor: "pointer" }}
          >
            Kijelentkezés
          </button>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div style={{ background: "white", border: "1px solid #e8e4de", padding: "20px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a746b", marginBottom: "10px" }}>User</div>
            <div style={{ fontWeight: 700 }}>{profile.name}</div>
            <div style={{ color: "#6b655b", marginTop: "6px" }}>{profile.email}</div>
            <div style={{ color: "#6b655b", marginTop: "6px" }}>{profile.role}</div>
          </div>
          <div style={{ background: "white", border: "1px solid #e8e4de", padding: "20px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a746b", marginBottom: "10px" }}>Auth</div>
            <div style={{ fontWeight: 700 }}>MSAL redirect flow active</div>
            <div style={{ color: "#6b655b", marginTop: "6px" }}>/api/v1/auth/me bootstrap wired</div>
          </div>
          <div style={{ background: "white", border: "1px solid #e8e4de", padding: "20px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a746b", marginBottom: "10px" }}>Status</div>
            <div style={{ fontWeight: 700 }}>Temporary landing</div>
            <div style={{ color: "#6b655b", marginTop: "6px" }}>Historical shell promotion continues next.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
