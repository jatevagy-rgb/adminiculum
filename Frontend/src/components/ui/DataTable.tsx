"use client";

import React from "react";
import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from "react";

export function DataTable({
  children,
  minWidth,
  className = "",
  ...tableProps
}: { minWidth?: number } & TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#E5E7E6] bg-white">
      <table
        className={`w-full text-left text-sm ${className}`}
        style={minWidth ? { minWidth } : undefined}
        {...tableProps}
      >
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className="border-b border-[#E5E7E6] bg-[#F8FAF9]" {...props}>
      {children}
    </thead>
  );
}

export function DataTableHeaderCell({
  children,
  align = "left",
  className = "",
  ...props
}: { align?: "left" | "center" | "right" } & ThHTMLAttributes<HTMLTableCellElement>) {
  const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280] ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className="divide-y divide-[#E5E7E6]" {...props}>
      {children}
    </tbody>
  );
}

export const DataTableRow = forwardRef<
  HTMLTableRowElement,
  { selected?: boolean } & HTMLAttributes<HTMLTableRowElement>
>(function DataTableRow({ children, selected = false, className = "", ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={`${selected ? "bg-[#F8FAF9]" : ""} hover:bg-[#F8FAF9] ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
});

export function DataTableCell({
  children,
  align = "left",
  muted = false,
  className = "",
  ...props
}: {
  align?: "left" | "center" | "right";
  muted?: boolean;
} & TdHTMLAttributes<HTMLTableCellElement>) {
  const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <td
      className={`px-3 py-3 align-top text-[13px] ${alignClass} ${muted ? "text-[#6B7280]" : ""} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export function DataTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}
