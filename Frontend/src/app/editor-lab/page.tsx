"use client";

/**
 * /editor-lab — converted route (DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1).
 *
 * The preliminary Tiptap sandbox that lived here has been superseded by the
 * canonical professional editor at /documents/[documentId]/edit. This route
 * now redirects to a blank working draft so existing links keep working and
 * no second, overlapping drafting editor remains. (The experimental embedded
 * review-suggestion components used by /documents/compare and the litigation
 * workspace are a separate, persisted review surface and remain unchanged.)
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EditorLabRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/documents/new/edit");
  }, [router]);
  return <div className="p-6 text-[12px] text-[#7A8479]">Átirányítás a professzionális szerkesztőre…</div>;
}
