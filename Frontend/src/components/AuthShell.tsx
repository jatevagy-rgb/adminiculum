"use client";

type AuthShellProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  notice?: {
    title: string;
    body: string;
    tone?: "default" | "warning";
  };
  microsoftLabel: string;
  microsoftDisabled?: boolean;
  onMicrosoftSignIn: () => void;
  onDevSignIn?: () => void;
  showDevSignIn?: boolean;
  children?: React.ReactNode;
};

export function AuthShell({
  title,
  subtitle,
  eyebrow = "Enterprise authentication",
  notice,
  microsoftLabel,
  microsoftDisabled,
  onMicrosoftSignIn,
  onDevSignIn,
  showDevSignIn = false,
  children,
}: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-frame">
        <div className="auth-brandbar">Adminiculum · belső ügyvédi munkatér</div>

        <div className="auth-shell">
          <section className="auth-brand-panel">
            <div>
              <div className="auth-wordmark">Adminiculum</div>
              <div className="auth-brand-title">Belépés a jogi munkapadba.</div>
              <p className="auth-brand-copy">
                Az Adminiculum belső ügyvédi munkafelület. Belépés csak jóváhagyott irodai
                Microsoft-fiókkal.
              </p>
            </div>

            <div className="auth-brand-footer">
              <div className="auth-brand-footer-label">Security protocol</div>
              <div className="auth-brand-footer-copy">&quot;Verba volant, scripta manent.&quot;</div>
            </div>
          </section>

          <section className="auth-content-panel">
            <div className="auth-card-inner">
              <div className="auth-eyebrow">{eyebrow}</div>
              <h1 className="auth-title">{title}</h1>
              <p className="auth-subtitle">{subtitle}</p>

              {notice && (
                <div className={`auth-notice auth-notice-${notice.tone || "default"}`}>
                  <div className="auth-notice-title">{notice.title}</div>
                  <div className="auth-notice-body">{notice.body}</div>
                </div>
              )}

              <button
                type="button"
                className="auth-microsoft-button"
                onClick={onMicrosoftSignIn}
                disabled={microsoftDisabled}
                style={{ marginTop: 28 }}
              >
                <span className="auth-microsoft-badge" aria-hidden="true">
                  <span className="ms-box ms-red" />
                  <span className="ms-box ms-green" />
                  <span className="ms-box ms-blue" />
                  <span className="ms-box ms-yellow" />
                </span>
                <span>{microsoftLabel}</span>
              </button>

              <p className="auth-helper">
                Belépés csak jóváhagyott irodai Microsoft-fiókkal. Nincs nyilvános regisztráció és
                nincs ügyfél-hozzáférés ezen a felületen. Ha nem tud belépni, forduljon a
                rendszergazdához.
              </p>

              <div className="auth-states">
                <div className="auth-state">
                  <strong>Lejárt munkamenet</strong>
                  Kérjük, jelentkezzen be újra a Microsoft-fiókkal.
                </div>
                <div className="auth-state">
                  <strong>Jogosultság hiányzik</strong>
                  A Microsoft-fiók nem rendelkezik Adminiculum-hozzáféréssel.
                </div>
              </div>

              {showDevSignIn && onDevSignIn && (
                <button
                  type="button"
                  className="auth-primary-button"
                  onClick={onDevSignIn}
                  style={{ marginTop: 14 }}
                >
                  Sign in (Local Dev)
                </button>
              )}

              {children}

              <div className="auth-meta-row">
                <span>v 2.4.0-legal</span>
                <span>Privacy policy</span>
                <span>Legal terms</span>
              </div>
            </div>
          </section>
        </div>

        <div className="auth-footer-row">
          <span>© {new Date().getFullYear()} Adminiculum · belső ügyvédi munkatér</span>
          <div className="auth-footer-links">
            <span>Terms of service</span>
            <span>Privacy policy</span>
            <span>Security</span>
            <span>Contact support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
