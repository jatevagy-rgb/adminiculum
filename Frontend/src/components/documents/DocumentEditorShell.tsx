"use client";

import { forwardRef, type ReactNode } from "react";
import { AdminStatusPill } from "@/components/adminiculum/ui";

type DocumentEditorShellProps = {
  title: string;
  subtitle?: string;
  helperText?: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  isDirty?: boolean;
  dirtyLabel?: string;
  cleanLabel?: string;
  badges?: ReactNode;
  status?: ReactNode;
  toolbar?: ReactNode;
  sideActions?: ReactNode;
  beforeEditor?: ReactNode;
  afterEditor?: ReactNode;
  emptyState?: ReactNode;
  showEditor?: boolean;
  placeholder?: string;
  rows?: number;
  minHeightClassName?: string;
  className?: string;
  pageClassName?: string;
  canvasClassName?: string;
  textareaClassName?: string;
  onSelect?: () => void;
  onMouseUp?: () => void;
  onKeyUp?: () => void;
  onClick?: () => void;
};

export const DocumentEditorShell = forwardRef<HTMLTextAreaElement, DocumentEditorShellProps>(
  function DocumentEditorShell(
    {
      title,
      subtitle,
      helperText,
      value,
      onChange,
      readOnly = false,
      isDirty = false,
      dirtyLabel = "Nem mentett helyi módosítások.",
      cleanLabel,
      badges,
      status,
      toolbar,
      sideActions,
      beforeEditor,
      afterEditor,
      emptyState,
      showEditor = true,
      placeholder,
      rows = 24,
      minHeightClassName = "min-h-[640px]",
      className = "",
      pageClassName = "max-w-[1180px]",
      canvasClassName = "",
      textareaClassName = "",
      onSelect,
      onMouseUp,
      onKeyUp,
      onClick,
    },
    ref,
  ) {
    const resolvedStatus = status ?? (
      <AdminStatusPill tone={isDirty ? "amber" : value.trim() ? "green" : "neutral"}>
        {isDirty ? "Helyi módosítás" : readOnly ? "Olvasási nézet" : "Szerkeszthető"}
      </AdminStatusPill>
    );

    return (
      <section className={`overflow-hidden rounded-[10px] border border-[#D8CFB6] bg-white shadow-sm ${className}`}>
        {isDirty ? (
          <div className="border-b border-[#E6C987] bg-[#FAEFCF] px-4 py-3 text-xs font-semibold text-[#7A5A1F]">
            {dirtyLabel}
          </div>
        ) : cleanLabel ? (
          <div className="border-b border-[#D9E6D9] bg-[#F5FAF5] px-4 py-3 text-xs font-semibold text-[#2F5A37]">
            {cleanLabel}
          </div>
        ) : null}

        <div className="border-b border-[#EEE7D9] bg-[#FCFAF4] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 break-words font-serif text-[22px] font-medium leading-tight text-[#1F2821]">
                  {title}
                </h2>
                {resolvedStatus}
                {badges}
              </div>
              {subtitle ? <p className="text-[11px] leading-5 text-[#6D6A62]">{subtitle}</p> : null}
            </div>
            {sideActions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{sideActions}</div> : null}
          </div>
          {toolbar ? <div className="mt-3 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>

        <div className="bg-[#F3EBD4] px-3 py-3 sm:px-5 lg:px-6">
          <div className={`mx-auto w-full ${pageClassName}`}>
            <div
              className={`border border-[rgba(22,32,26,0.14)] bg-[#FFFDF8] px-5 py-6 shadow-[0_18px_50px_rgba(22,32,26,0.12)] sm:px-8 lg:px-12 ${canvasClassName}`}
            >
              {beforeEditor}
              {showEditor ? (
                <textarea
                  ref={ref}
                  value={value}
                  onChange={(event) => onChange?.(event.target.value)}
                  onSelect={onSelect}
                  onMouseUp={onMouseUp}
                  onKeyUp={onKeyUp}
                  onClick={onClick}
                  readOnly={readOnly}
                  rows={rows}
                  placeholder={placeholder}
                  className={`w-full resize-y border-0 bg-transparent p-0 font-serif text-[16px] leading-8 text-[#1F2821] outline-none placeholder:text-[#A6AEA3] focus:ring-0 read-only:cursor-text ${minHeightClassName} ${textareaClassName}`}
                />
              ) : (
                emptyState
              )}
              {afterEditor}
              {helperText ? (
                <p className="mt-4 rounded-[6px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  {helperText}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  },
);

DocumentEditorShell.displayName = "DocumentEditorShell";
