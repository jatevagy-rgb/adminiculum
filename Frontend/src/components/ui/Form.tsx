"use client";

import React, {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type LabelHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  isError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isError = false, className = "", ...props },
  ref
) {
  const errorClass = isError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <input
      ref={ref}
      className={`block w-full h-10 px-3 py-2 text-sm bg-white rounded-[8px] border transition-colors placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-2 disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed ${errorClass} ${className}`}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { isError = false, className = "", rows = 3, ...props },
  ref
) {
  const errorClass = isError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`block w-full px-3 py-2 text-sm bg-white rounded-[8px] border transition-colors placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-2 disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed ${errorClass} ${className}`}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  isError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { isError = false, className = "", children, ...props },
  ref
) {
  const errorClass = isError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <select
      ref={ref}
      className={`block w-full h-10 px-3 py-2 text-sm bg-white rounded-[8px] border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed ${errorClass} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: ReactNode;
}

export function Label({ required = false, className = "", children, ...props }: LabelProps) {
  return (
    <label
      className={`block text-xs font-semibold tracking-wide text-[#374151] mb-1.5 ${className}`}
      {...props}
    >
      {children}
      {required && <span className="text-[#B85C4B] ml-1" aria-hidden="true">*</span>}
    </label>
  );
}

export interface FormHelpProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function FormHelp({ className = "", children, ...props }: FormHelpProps) {
  return (
    <p className={`mt-1 text-xs text-[#6B7280] ${className}`} {...props}>
      {children}
    </p>
  );
}

export interface FormErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function FormError({ className = "", children, ...props }: FormErrorProps) {
  return (
    <p role="alert" className={`mt-1 text-xs font-medium text-red-600 ${className}`} {...props}>
      {children}
    </p>
  );
}

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ReactNode;
}

export function FormField({
  label,
  required = false,
  help,
  error,
  className = "",
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`} {...props}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {help && !error && <FormHelp>{help}</FormHelp>}
      {error && <FormError>{error}</FormError>}
    </div>
  );
}
