import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import ShowroomClient from "./ShowroomClient";

export const dynamic = "force-dynamic";

export default function ShowroomPage() {
  const isProduction = process.env.NODE_ENV === "production";
  const isExplicitlyEnabled = process.env.ADMINICULUM_ENABLE_UI_SHOWROOM === "true";

  // Production default denied (fail-closed)
  if (isProduction && !isExplicitlyEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Betöltés...</div>}>
      <ShowroomClient />
    </Suspense>
  );
}
