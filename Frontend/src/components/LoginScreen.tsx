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
          ? "A munkamenet lejárt. Jelentkezzen be újra Microsoft-fiókkal."
          : "Jelentkezzen be Microsoft-fiókkal."
      }
      eyebrow={isExpired ? "Munkamenet lejárt" : "Bejelentkezés"}
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
    />
  );
}
