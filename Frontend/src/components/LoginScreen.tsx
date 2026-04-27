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
      title={isExpired ? "Session expired" : "Log in to your workspace"}
      subtitle={
        isExpired
          ? "Your secure legal session has ended. Sign in again to restore access to the workspace."
          : "Enter your credentials to access the legal vault."
      }
      eyebrow={isExpired ? "Session security alert" : "Enterprise authentication"}
      notice={
        isExpired
          ? {
              title: "Session expired",
              body: errorMessage || "For your protection, the Adminiculum session timed out and requires renewed Microsoft authentication.",
              tone: "warning",
            }
          : errorMessage
            ? {
                title: "Authentication status",
                body: errorMessage,
                tone: "warning",
              }
            : undefined
      }
      microsoftLabel={disabled ? "Redirect in progress..." : "Sign in with Microsoft"}
      microsoftDisabled={disabled}
      onMicrosoftSignIn={onSignIn}
      onDevSignIn={onDevSignIn}
      showDevSignIn={showDevSignIn}
    >
      <p className="auth-support-copy">
        Microsoft Entra ID remains the primary authentication path. Email and password fields are retained as visual policy context only.
      </p>
    </AuthShell>
  );
}
