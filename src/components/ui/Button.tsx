"use client";

import React, { type ButtonHTMLAttributes, forwardRef } from "react";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "xl" | "icon";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const baseStyles = [
  "inline-flex items-center justify-center gap-2",
  "font-medium",
  "rounded-md",
  "transition-all duration-150 ease-out",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface-base)",
].join(" ");

const variants = {
  primary: [
    "bg-(--accent) text-(--surface-base)",
    "hover:bg-(--accent-hover)",
    "active:bg-(--accent-active)",
    "shadow-(--shadow-sm) hover:shadow-(--shadow-md)",
  ].join(" "),
  secondary: [
    "bg-(--surface-raised) text-(--text-primary)",
    "border border-(--border-default)",
    "hover:bg-(--surface-overlay) hover:border-(--border-strong)",
    "active:bg-(--surface-base)",
  ].join(" "),
  ghost: [
    "bg-transparent text-(--text-secondary)",
    "hover:bg-(--surface-raised) hover:text-(--text-primary)",
    "active:bg-(--surface-overlay)",
  ].join(" "),
  outline: [
    "bg-transparent text-(--text-primary)",
    "border border-(--border-default)",
    "hover:bg-(--surface-raised) hover:border-(--border-strong)",
    "active:bg-(--surface-overlay)",
  ].join(" "),
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
  xl: "h-12 px-6 text-base",
  icon: "h-10 w-10 p-2",
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      fullWidth,
      icon,
      iconPosition = "left",
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={twMerge(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className,
        )}
        disabled={loading || disabled}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}

        {icon && iconPosition === "left" && !loading && (
          <span className="flex items-center">{icon}</span>
        )}

        {children && <span>{children}</span>}

        {icon && iconPosition === "right" && !loading && (
          <span className="flex items-center">{icon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
