"use client";

import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  className = "",
  variant = "primary",
  disabled,
  loading,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary:
      "bg-sky-600 text-white hover:bg-sky-700 focus-visible:ring-sky-500 ring-offset-white",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400 ring-offset-white",
    ghost:
      "text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 ring-offset-white",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 ring-offset-white",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white"
        />
      )}
      {children}
    </button>
  );
}

