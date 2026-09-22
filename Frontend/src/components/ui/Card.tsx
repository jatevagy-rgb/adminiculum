"use client";

import React, { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "interactive";
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", className = "", children, ...props },
  ref
) {
  const variantClass =
    variant === "subtle"
      ? "bg-[#F8FAF9] border-[#E5E7E6]"
      : variant === "interactive"
      ? "bg-white border-[#E5E7E6] hover:border-[#D1D5DB] transition-colors shadow-sm"
      : "bg-white border-[#E5E7E6] shadow-sm";

  return (
    <div
      ref={ref}
      className={`rounded-[12px] border text-[#1F2937] ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export const Panel = Card;

export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col gap-1 border-b border-[#E5E7E6] px-5 py-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`font-serif text-lg font-semibold leading-tight text-[#1F2937] ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-xs text-[#6B7280] leading-normal ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center justify-end gap-3 border-t border-[#E5E7E6] px-5 py-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
