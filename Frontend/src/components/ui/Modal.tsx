"use client";

import React, { useEffect, type ReactNode } from "react";
import { IconButton } from "./Button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  children: ReactNode;
  footer?: ReactNode;
}

const maxWidthClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  maxWidth = "xl",
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full rounded-[12px] border border-[#E5E7E6] bg-white shadow-xl max-h-[90vh] flex flex-col ${maxWidthClasses[maxWidth]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7E6] px-6 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="font-serif text-xl font-semibold text-[#1F2937] leading-tight">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-[#6B7280]">
                {description}
              </p>
            )}
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Bezárás"
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#1F2937]"
          >
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7E6] bg-[#F8FAF9] px-6 py-4 rounded-b-[12px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
