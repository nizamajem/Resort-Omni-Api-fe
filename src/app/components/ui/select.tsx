"use client";

import * as React from "react";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string;
  helper?: string;
};

export function Select({ className = "", error, helper, children, ...props }: SelectProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="relative">
        <select
          className="block w-full appearance-none rounded-md border bg-white px-3 py-2 pr-9 text-left outline-none focus:ring-2 focus:ring-sky-500 text-slate-900"
          {...props}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
          ▾
        </span>
      </div>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : helper ? (
        <p className="text-xs text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
}
