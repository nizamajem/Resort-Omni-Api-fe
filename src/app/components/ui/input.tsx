"use client";

import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: string;
  helper?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", prefix, suffix, error, helper, ...props }, ref) => {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex items-stretch overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-sky-500">
          {prefix && (
            <div className="grid place-items-center px-3 text-slate-500 border-r bg-slate-50">
              {prefix}
            </div>
          )}
          <input
            ref={ref}
            className="min-w-0 flex-1 px-3 py-2 outline-none placeholder:text-slate-400"
            {...props}
          />
          {suffix && (
            <div className="grid place-items-center px-3 text-slate-500 border-l bg-slate-50">
              {suffix}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs text-rose-600">{error}</p>
        ) : helper ? (
          <p className="text-xs text-slate-500">{helper}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

