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
        <div className="auth-brandbar">Adminiculum: Enterprise Authentication Portal</div>

        <div className="auth-shell">
          <section className="auth-brand-panel">
            <div>
              <div className="auth-wordmark">Adminiculum</div>
              <div className="auth-brand-title">Lex Architectura</div>
              <p className="auth-brand-copy">
                The architectural manuscript of legal systems. Precision, tradition, and digital permanence.
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

              <div className="auth-form-grid">
                <label className="auth-field">
                  <span>Email address</span>
                  <input type="email" placeholder="attorney@adminiculum.law" disabled />
                </label>

                <div className="auth-password-row">
                  <label className="auth-field">
                    <span>Password</span>
                    <input type="password" value="........" readOnly disabled />
                  </label>
                  <button type="button" className="auth-inline-link" disabled>
                    Forgot password?
                  </button>
                </div>
              </div>

              <button type="button" className="auth-primary-button" disabled>
                Sign in
              </button>

              <div className="auth-divider">Enterprise authentication</div>

              <button
                type="button"
                className="auth-microsoft-button"
                onClick={onMicrosoftSignIn}
                disabled={microsoftDisabled}
              >
                <span className="auth-microsoft-badge" aria-hidden="true">
                  <span className="ms-box ms-red" />
                  <span className="ms-box ms-green" />
                  <span className="ms-box ms-blue" />
                  <span className="ms-box ms-yellow" />
                </span>
                <span>{microsoftLabel}</span>
              </button>

              {showDevSignIn && onDevSignIn && (
                <button
                  type="button"
                  className="auth-primary-button"
                  onClick={onDevSignIn}
                  style={{ marginTop: 10 }}
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
          <span>© 2024 Adminiculum Legal Systems. All rights reserved.</span>
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
