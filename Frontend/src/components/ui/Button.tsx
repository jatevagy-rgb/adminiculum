"use client";

import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "tertiary"
  | "ghost"
  | "neutral"
  | "danger"
  | "danger-outline"
  | "success"
  | "confirm";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#0F3D32] text-white border border-[#0F3D32] hover:bg-[#062B22] hover:border-[#062B22] active:bg-[#041D17]",
  secondary:
    "bg-white text-[#0F3D32] border border-[#0F3D32] hover:bg-[#F8FAF9] active:bg-[#EFEFEF]",
  accent:
    "bg-[#B85C4B] text-white border border-[#B85C4B] hover:bg-[#9E4A3B] hover:border-[#9E4A3B] active:bg-[#853D30]",
  tertiary:
    "bg-transparent text-[#1F2937] border border-transparent hover:bg-[#F8FAF9] active:bg-[#E5E7E6]",
  ghost:
    "bg-transparent text-[#1F2937] border border-transparent hover:bg-[#F8FAF9] active:bg-[#E5E7E6]",
  neutral:
    "bg-white text-[#1F2937] border border-[#E5E7E6] hover:bg-[#F8FAF9] hover:border-[#D1D5DB] active:bg-[#E5E7E6]",
  danger:
    "bg-[#DC2626] text-white border border-[#DC2626] hover:bg-[#B91C1C] hover:border-[#B91C1C] active:bg-[#991B1B]",
  "danger-outline":
    "bg-white text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] hover:border-[#F87171] active:bg-[#FEE2E2]",
  success:
    "bg-[#1E7E51] text-white border border-[#1E7E51] hover:bg-[#165E3D] hover:border-[#165E3D] active:bg-[#11492F]",
  confirm:
    "bg-[#1E7E51] text-white border border-[#1E7E51] hover:bg-[#165E3D] hover:border-[#165E3D] active:bg-[#11492F]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-[6px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[8px]",
  lg: "h-12 px-5 text-base gap-2.5 rounded-[8px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = "button",
    variant = "neutral",
    size = "md",
    isLoading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    children,
    className = "",
    ...props
  },
  ref
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? true : undefined}
      className={`inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin text-current shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  children: ReactNode;
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 w-8 min-w-[32px] rounded-[6px] text-xs",
  md: "h-10 w-10 min-w-[40px] rounded-[8px] text-sm",
  lg: "h-12 w-12 min-w-[48px] rounded-[8px] text-base",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    type = "button",
    variant = "ghost",
    size = "md",
    isLoading = false,
    disabled = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? true : undefined}
      className={`inline-flex items-center justify-center p-0 transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3D32] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none ${iconSizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        children
      )}
    </button>
  );
});
