"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const adminUi = {
  paper: "var(--adm-surface-raised)",
  cream: "var(--adm-ivory-100)",
  cream2: "var(--adm-ivory-50)",
  cream3: "var(--adm-surface)",
  gutter: "var(--adm-border)",
  ink: "var(--adm-text)",
  ink2: "#33443a",
  ink3: "var(--adm-text-muted)",
  ink4: "var(--adm-text-soft)",
  green: "var(--adm-green-950)",
  greenHover: "var(--adm-green-900)",
  greenFg: "var(--adm-ivory-50)",
  greenSoft: "var(--adm-sage-100)",
  gold: "var(--adm-ochre-500)",
  goldHover: "#8E6A1B",
  goldSoft: "var(--adm-sand-100)",
  amber: "#B97A0F",
  amberBg: "var(--adm-sand-100)",
  blue: "#2D4A7C",
  blueBg: "#EAEFF6",
  sage: "#4A6B4A",
  sageSoft: "#D9E3CC",
  burgundy: "var(--adm-terracotta-700)",
  burgundySoft: "var(--adm-terracotta-100)",
  violet: "#5D479F",
};

const buttonClasses = {
  primary: "border-[#062416] bg-[#082817] text-[#F4EFDB] hover:bg-[#062416]",
  gold: "border-[#8E6A1B] bg-[#B58A2A] text-white hover:bg-[#8E6A1B]",
  ai: "border-[#D6DEEC] bg-white text-[#2D4A7C] hover:bg-[#EAEFF6]",
  neutral: "border-[rgba(22,32,26,0.20)] bg-white text-[#16201A] hover:border-[#16201A] hover:bg-[#FBF6E7]",
  warning: "border-[#B97A0F] bg-[#FAEFCF] text-[#7d530a] hover:bg-[#F2E4BD]",
  muted: "border-[rgba(22,32,26,0.20)] border-dashed bg-transparent text-[#7A8479] hover:bg-[rgba(22,32,26,0.04)]",
  danger: "border-[#F2DAD6] bg-white text-[#8B2A2A] hover:bg-[#F2DAD6]",
  ghost: "border-transparent bg-transparent text-[#3D4842] hover:bg-[rgba(22,32,26,0.06)]",
};

const buttonSizes = {
  xs: "px-2 py-1 text-[11px]",
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-4 py-2 text-[13px]",
  lg: "px-5 py-3 text-sm",
};

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonClasses;
  size?: keyof typeof buttonSizes;
};

export function AdminButton({ variant = "neutral", size = "md", className = "", type = "button", ...props }: AdminButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[5px] border font-semibold leading-none tracking-[0.005em] transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${buttonSizes[size]} ${buttonClasses[variant]} ${className}`}
      {...props}
    />
  );
}

const badgeClasses = {
  green: "border-[rgba(8,40,23,0.22)] bg-[#E2E8DA] text-[#123B27]",
  gold: "border-[rgba(181,138,42,0.25)] bg-[rgba(181,138,42,0.10)] text-[#8E6A1B]",
  amber: "border-[rgba(185,122,15,0.25)] bg-[#FAEFCF] text-[#B97A0F]",
  blue: "border-[rgba(45,74,124,0.18)] bg-[#EAEFF6] text-[#2D4A7C]",
  sage: "border-[rgba(74,107,74,0.18)] bg-[#D9E3CC] text-[#4A6B4A]",
  violet: "border-[rgba(93,71,159,0.22)] bg-[#E2DBF1] text-[#5D479F]",
  burgundy: "border-[#F2DAD6] bg-[#F2DAD6] text-[#8B2A2A]",
  neutral: "border-[rgba(22,32,26,0.20)] bg-[#FBF6E7] text-[#3D4842]",
};

type AdminBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof badgeClasses;
  dot?: boolean;
};

export function AdminBadge({ tone = "neutral", dot = false, className = "", children, ...props }: AdminBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] ${badgeClasses[tone]} ${className}`}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function AdminStatusPill({ tone = "neutral", dot = true, className = "", children, ...props }: AdminBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClasses[tone]} ${className}`}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function AdminPanel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-[8px] border border-[rgba(22,32,26,0.10)] bg-white ${className}`} {...props} />;
}

export function AdminSectionHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[rgba(22,32,26,0.10)] px-4 py-3">
      <div>
        {eyebrow ? <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">{eyebrow}</p> : null}
        <h3 className="font-serif text-xl font-medium leading-tight text-[#16201A]">{title}</h3>
        {subtitle ? <p className="mt-1 text-[11.5px] text-[#7A8479]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type AdminDocumentRowProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  meta?: string;
  fileType?: string;
  active?: boolean;
  variant?: "upload" | "generated" | "handoff";
  status?: ReactNode;
};

export function AdminDocumentRow({ title, meta, fileType = "DOC", active = false, variant = "upload", status, className = "", ...props }: AdminDocumentRowProps) {
  const iconTone = variant === "handoff" ? "border-[#5D479F] text-[#5D479F]" : variant === "generated" ? "border-[#123B27] text-[#123B27]" : "border-[#8E6A1B] text-[#8E6A1B]";
  return (
    <button
      type="button"
      className={`relative w-full rounded-[5px] border bg-white p-3 text-left transition-colors hover:border-[rgba(22,32,26,0.20)] ${active ? "border-[#123B27] border-l-4 bg-[#FFFCEB]" : "border-[rgba(22,32,26,0.10)]"} ${className}`}
      {...props}
    >
      {active ? <span className="absolute right-2 top-2 rounded-[3px] bg-[#082817] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#F4EFDB]"><span className="text-[#B58A2A]">●</span> Aktív</span> : null}
      <div className="flex items-center gap-2 pr-14">
        <span className={`flex h-[30px] w-6 shrink-0 items-end justify-center rounded-sm border bg-[#FBF6E7] pb-0.5 text-[7.5px] font-bold ${iconTone}`}>{fileType}</span>
        <span className="truncate text-[13px] font-semibold text-[#16201A]">{title}</span>
      </div>
      {meta ? <p className="mt-1 truncate text-[11px] text-[#7A8479]">{meta}</p> : null}
      {status ? <div className="mt-2 flex flex-wrap gap-1.5">{status}</div> : null}
    </button>
  );
}
