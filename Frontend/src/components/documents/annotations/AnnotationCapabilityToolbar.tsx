"use client";

/**
 * Capability-driven annotation toolbar.
 *
 * Only tools the current renderer genuinely supports are offered. When a tool is
 * unsupported it is not rendered as a dead control — instead a single controlled
 * explanation states why, so the reviewer is never invited to create an anchor
 * that would point at nothing.
 */
import type { AnnotationRendererCapabilities } from "@/lib/annotations/annotationCapabilities";
import { hasNoCreationCapability } from "@/lib/annotations/annotationCapabilities";

export type VisualAnnotationMode = "PAGE_RECTANGLE" | "PAGE_ELLIPSE" | "PAGE_POINT";

const MODE_LABELS: Record<VisualAnnotationMode, string> = {
  PAGE_RECTANGLE: "Téglalap",
  PAGE_ELLIPSE: "Kör",
  PAGE_POINT: "Pont",
};

export function AnnotationCapabilityToolbar({
  capabilities,
  visualMode,
  onVisualModeChange,
}: {
  capabilities: AnnotationRendererCapabilities;
  visualMode: VisualAnnotationMode | null;
  onVisualModeChange: (mode: VisualAnnotationMode | null) => void;
}) {
  const available: VisualAnnotationMode[] = [];
  if (capabilities.canCreatePageRectangle) available.push("PAGE_RECTANGLE");
  if (capabilities.canCreatePageEllipse) available.push("PAGE_ELLIPSE");
  if (capabilities.canCreatePagePoint) available.push("PAGE_POINT");

  if (hasNoCreationCapability(capabilities)) {
    return (
      <p
        data-testid="annotation-capability-explanation"
        className="max-w-md rounded-[10px] border border-[rgba(22,32,26,0.14)] bg-white px-3 py-2 text-xs text-[#3D4842]"
      >
        {capabilities.explanation || "Ehhez a formátumhoz nem hozható létre annotáció."}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {capabilities.canCreateTextRange ? (
        <span
          data-testid="annotation-text-capability"
          className="rounded-full border border-[rgba(22,32,26,0.14)] bg-white px-3 py-1 text-xs font-bold text-[#3D4842]"
        >
          Szövegkijelölés elérhető
        </span>
      ) : null}

      {available.map((mode) => (
        <button
          key={mode}
          type="button"
          data-testid={`annotation-tool-${mode}`}
          aria-pressed={visualMode === mode}
          onClick={() => onVisualModeChange(visualMode === mode ? null : mode)}
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            visualMode === mode
              ? "border-[#D8C58E] bg-[var(--adm-sand-100)] text-[#6D5418]"
              : "border-[rgba(22,32,26,0.14)] bg-white text-[#3D4842]"
          }`}
        >
          {MODE_LABELS[mode]}
        </button>
      ))}

      {available.length === 0 && capabilities.explanation ? (
        <span data-testid="annotation-geometry-unavailable" className="text-xs text-[#3D4842]">
          {capabilities.explanation}
        </span>
      ) : null}
    </div>
  );
}
