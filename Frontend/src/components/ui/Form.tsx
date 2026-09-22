"use client";

import React, {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type LabelHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

interface FieldA11yContext {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
}

const FormFieldContext = createContext<FieldA11yContext | null>(null);

function findExplicitControlId(children: ReactNode): string | undefined {
  let found: string | undefined;
  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child)) return;
    const props = child.props as { id?: string; children?: ReactNode };
    if (typeof props.id === "string" && props.id.length > 0) {
      found = props.id;
      return;
    }
    if (props.children) {
      const nested = findExplicitControlId(props.children);
      if (nested) found = nested;
    }
  });
  return found;
}

function useFieldA11y(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  isError?: boolean;
}) {
  const ctx = useContext(FormFieldContext);
  const describedBy =
    [props["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  const invalid = props["aria-invalid"] ?? (ctx?.invalid ? true : undefined);
  return {
    id: props.id ?? ctx?.controlId,
    "aria-describedby": describedBy,
    "aria-invalid": invalid,
    resolvedError: Boolean(props.isError) || Boolean(ctx?.invalid),
  };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  isError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isError = false, className = "", id, "aria-describedby": describedByProp, "aria-invalid": invalidProp, ...props },
  ref
) {
  const a11y = useFieldA11y({ id, "aria-describedby": describedByProp, "aria-invalid": invalidProp, isError });
  const errorClass = a11y.resolvedError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <input
      ref={ref}
      id={a11y.id}
      aria-describedby={a11y["aria-describedby"]}
      aria-invalid={a11y["aria-invalid"]}
      className={`block w-full h-10 px-3 py-2 text-sm bg-white rounded-[8px] border transition-colors placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-2 disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed ${errorClass} ${className}`}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { isError = false, className = "", rows = 3, id, "aria-describedby": describedByProp, "aria-invalid": invalidProp, ...props },
  ref
) {
  const a11y = useFieldA11y({ id, "aria-describedby": describedByProp, "aria-invalid": invalidProp, isError });
  const errorClass = a11y.resolvedError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <textarea
      ref={ref}
      id={a11y.id}
      aria-describedby={a11y["aria-describedby"]}
      aria-invalid={a11y["aria-invalid"]}
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
  { isError = false, className = "", id, children, "aria-describedby": describedByProp, "aria-invalid": invalidProp, ...props },
  ref
) {
  const a11y = useFieldA11y({ id, "aria-describedby": describedByProp, "aria-invalid": invalidProp, isError });
  const errorClass = a11y.resolvedError
    ? "border-red-500 text-red-900 focus-visible:ring-red-500"
    : "border-[#E5E7E6] text-[#1F2937] focus-visible:ring-[#0F3D32] focus-visible:border-transparent";

  return (
    <select
      ref={ref}
      id={a11y.id}
      aria-describedby={a11y["aria-describedby"]}
      aria-invalid={a11y["aria-invalid"]}
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
  controlId?: string;
  children: ReactNode;
}

export function FormField({
  label,
  required = false,
  help,
  error,
  controlId,
  children,
  className = "",
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const resolvedId = controlId ?? findExplicitControlId(children) ?? generatedId;
  const helpId = `${resolvedId}-help`;
  const errorId = `${resolvedId}-error`;
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`space-y-1 ${className}`} {...props}>
      {label ? (
        <Label required={required} htmlFor={resolvedId}>
          {label}
        </Label>
      ) : null}
      <FormFieldContext.Provider
        value={{ controlId: resolvedId, describedBy, invalid: Boolean(error) }}
      >
        {children}
      </FormFieldContext.Provider>
      {help ? <FormHelp id={helpId}>{help}</FormHelp> : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  );
}
