"use client";

import React from "react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Common = {
  children: ReactNode;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

type LinkVariant = Common & {
  href: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;

type ButtonVariant = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled" | "onClick" | "type"> & {
  href?: undefined;
  onClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>["onClick"]>;
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
    const { href, children: _children, icon: _icon, size: _size, className: _className, ...linkProps } = props;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { onClick, disabled, type = "button", children: _children, icon: _icon, size: _size, className: _className, ...buttonProps } = props;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
