"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

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

const LEGAL_QUOTES: Array<{ text: string; author: string }> = [
  { text: "A jog élete nem logika volt, hanem tapasztalat.", author: "Oliver Wendell Holmes Jr." },
  { text: "Az igazságot nem rohammal kell bevenni; lassú lépésekkel kell megközelíteni.", author: "Benjamin N. Cardozo" },
  { text: "A szabadság az emberek szívében él.", author: "Learned Hand" },
  { text: "A napfény a legjobb fertőtlenítőszer.", author: "Louis D. Brandeis" },
];

export function AuthShell({
  title,
  subtitle,
  eyebrow = "Bejelentkezés",
  notice,
  microsoftLabel,
  microsoftDisabled,
  onMicrosoftSignIn,
  onDevSignIn,
  showDevSignIn = false,
  children,
}: AuthShellProps) {
  // Hydration-safe rotation: server + first client render show quote 0, then pick by day after mount.
  const [quoteIndex, setQuoteIndex] = useState(0);
  useEffect(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    setQuoteIndex(dayOfYear % LEGAL_QUOTES.length);
  }, []);
  const quote = LEGAL_QUOTES[quoteIndex];

  return (
    <div className="auth-page">
      <div className="auth-frame">
        <div className="auth-shell">
          <section className="auth-brand-panel">
            <div>
              <div className="auth-wordmark-row">
                <span className="auth-logo-mark">
                  <Image
                    src="/brand/adminiculum-logo.png"
                    alt="Adminiculum logó"
                    width={46}
                    height={58}
                    className="h-full w-full object-contain"
                    priority
                  />
                </span>
                <span className="auth-wordmark">Adminiculum</span>
              </div>
              <div className="auth-brand-title">Belépés</div>
            </div>

            <figure className="auth-quote">
              <blockquote className="auth-quote-text">{quote.text}</blockquote>
              <figcaption className="auth-quote-author">— {quote.author}</figcaption>
            </figure>
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
                style={{ marginTop: 24 }}
              >
                <span className="auth-microsoft-badge" aria-hidden="true">
                  <span className="ms-box ms-red" />
                  <span className="ms-box ms-green" />
                  <span className="ms-box ms-blue" />
                  <span className="ms-box ms-yellow" />
                </span>
                <span>{microsoftLabel}</span>
              </button>

              <div className="auth-entry-list">
                <button
                  type="button"
                  className="auth-entry"
                  onClick={onMicrosoftSignIn}
                  disabled={microsoftDisabled}
                >
                  <span className="auth-entry-title">Külsős ügyvédként lépek be</span>
                  <span className="auth-entry-sub">Meghívott külsős jogászok is Microsoft-fiókkal lépnek be.</span>
                </button>

                <div className="auth-entry auth-entry-disabled" aria-disabled="true">
                  <span className="auth-entry-title">
                    Ügyfélportál
                    <span className="auth-entry-tag">Hamarosan</span>
                  </span>
                  <span className="auth-entry-sub">Külön, hitelesített ügyfélfelület — később, ezen a felületen nem elérhető.</span>
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
            </div>
          </section>
        </div>

        <div className="auth-footer-row">
          <span>© {new Date().getFullYear()} Adminiculum</span>
          <div className="auth-footer-links">
            <span>Adatvédelem</span>
            <span>Biztonság</span>
          </div>
        </div>
      </div>
    </div>
  );
}
