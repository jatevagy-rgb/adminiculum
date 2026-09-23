"use client";

import React, { type HTMLAttributes, type ReactNode } from "react";

export type BadgeTone =
  | "green"
  | "terracotta"
  | "gold"
  | "teal"
  | "navy"
  | "neutral"
  | "danger"
  | "warning"
  | "info";

export type BadgeStatus =
  | "active"
  | "draft"
  | "pending"
  | "urgent"
  | "completed"
  | "closed"
  | "archived"
  | "warning"
  | "error"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
  tone?: BadgeTone;
  shape?: "pill" | "rounded";
  dot?: boolean;
  children: ReactNode;
}

const statusToneMap: Record<BadgeStatus, BadgeTone> = {
  active: "green",
  draft: "gold",
  pending: "warning",
  urgent: "danger",
  completed: "neutral",
  closed: "neutral",
  archived: "neutral",
  warning: "warning",
  error: "danger",
  info: "teal",
};

const toneClasses: Record<BadgeTone, string> = {
  green: "border-[#BCE4CE] bg-[#E8F5EE] text-[#0F3D32]",
  terracotta: "border-[#F1D7D1] bg-[#FBF0EE] text-[#B85C4B]",
  gold: "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]",
  teal: "border-[#BAE6FD] bg-[#F0F9FF] text-[#0369A1]",
  navy: "border-[#C7D2FE] bg-[#EEF2FF] text-[#312E81]",
  neutral: "border-[#E5E7E6] bg-[#F3F4F6] text-[#374151]",
  danger: "border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]",
  warning: "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]",
  info: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1E40AF]",
};

export function Badge({
  status,
  tone,
  shape = "rounded",
  dot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  const resolvedTone = tone || (status ? statusToneMap[status] : "neutral");
  const shapeClass = shape === "pill" ? "rounded-full" : "rounded-[4px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium leading-none tracking-[0.01em] ${shapeClass} ${toneClasses[resolvedTone]} ${className}`}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatusChip({
  status,
  tone,
  dot = true,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <Badge
      status={status}
      tone={tone}
      shape="pill"
      dot={dot}
      className={`px-2.5 py-1 text-xs ${className}`}
      {...props}
    >
      {children}
    </Badge>
  );
}
