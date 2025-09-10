"use client";

import * as React from "react";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  requiredMark?: boolean;
};

export function Label({ className = "", requiredMark, children, ...props }: LabelProps) {
  return (
    <label
      className={`text-sm font-medium text-slate-700 ${className}`}
      {...props}
    >
      {children}
      {requiredMark ? <span className="ml-0.5 text-rose-600">*</span> : null}
    </label>
  );
}

