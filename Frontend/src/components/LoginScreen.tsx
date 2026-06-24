"use client";

import { AuthShell } from "@/components/AuthShell";

type LoginScreenProps = {
  onSignIn: () => void;
  onDevSignIn?: () => void;
  showDevSignIn?: boolean;
  disabled?: boolean;
  variant?: "default" | "session-expired";
  errorMessage?: string | null;
};

export function LoginScreen({ onSignIn, onDevSignIn, showDevSignIn = false, disabled = false, variant = "default", errorMessage }: LoginScreenProps) {
  const isExpired = variant === "session-expired";

  return (
    <AuthShell
      title="Adminiculum"
      subtitle={
        isExpired
          ? "A biztonságos munkamenet lejárt. Jelentkezzen be újra az irodai Microsoft-fiókkal a munkatér eléréséhez."
          : "Folytatáshoz jelentkezzen be az irodai Microsoft / Entra ID fiókkal."
      }
      eyebrow={isExpired ? "Munkamenet-biztonsági jelzés" : "Belső ügyvédi munkatér"}
      notice={
        isExpired
          ? {
              title: "Lejárt munkamenet",
              body: errorMessage || "Biztonsági okból az Adminiculum munkamenet lejárt, és ismételt Microsoft-hitelesítés szükséges.",
              tone: "warning",
            }
          : errorMessage
            ? {
                title: "Hitelesítési állapot",
                body: errorMessage,
                tone: "warning",
              }
            : undefined
      }
      microsoftLabel={disabled ? "Átirányítás folyamatban…" : "Belépés Microsoft-fiókkal"}
      microsoftDisabled={disabled}
      onMicrosoftSignIn={onSignIn}
      onDevSignIn={onDevSignIn}
      showDevSignIn={showDevSignIn}
    >
      <p className="auth-support-copy">
        A Microsoft Entra ID az egyetlen belépési útvonal. Nincs e-mail/jelszó alapú belépés ezen a felületen.
      </p>
    </AuthShell>
  );
}
