"use client";

import React from "react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Common = {
  children: ReactNode;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

type LinkVariant = Common & {
  href: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;

type ButtonVariant = Common & {
  href?: undefined;
  onClick: () => void;
  disabled?: boolean;
  type?: "button";
};

export type QuietLinkProps = LinkVariant | ButtonVariant;

export function QuietLink(props: QuietLinkProps) {
  const { children, icon, size = "md", className = "" } = props;
  const classes = `inline-flex items-center gap-1.5 font-medium text-[#0F3D32] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32] focus-visible:ring-offset-2 rounded-[4px] disabled:opacity-50 ${size === "sm" ? "text-xs" : "text-sm"} ${className}`;
  const content = (
    <>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...linkProps } = props;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { onClick, disabled, type = "button" } = props;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  );
}
