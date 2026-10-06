"use client";

import { type InputHTMLAttributes, type ComponentType, forwardRef, useId, useState } from "react";
import { twMerge } from "tailwind-merge";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  success?: boolean;
  inputSize?: "sm" | "md" | "lg";
  required?: boolean;
  showPasswordToggle?: boolean;
  icon?: ComponentType<{ className?: string }>;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      success,
      inputSize = "md",
      required,
      showPasswordToggle,
      icon: Icon,
      className,
      type = "text",
      ...props
    },
    ref,
  ) => {
    const inputId = useId();
    const errorId = useId();
    const hintId = useId();
    const [showPassword, setShowPassword] = useState(false);
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-4 text-base",
    } as const;

    const inputClasses = twMerge(
      // Base styles
      "w-full rounded-md border transition-all duration-150 ease-out",
      "bg-(--surface-input)",
      "text-(--text-primary)",
      "placeholder:text-(--text-muted)",

      // Border states
      !error && !success && "border-(--border-default)",
      error && "border-(--error)",
      success && "border-(--success)",

      // Focus state
      "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-(--surface-base)",
      !error && !success && "focus:ring-(--accent) focus:border-(--accent)",
      error && "focus:ring-(--error) focus:border-(--error)",
      success && "focus:ring-(--success) focus:border-(--success)",

      // Hover state
      !error && !success && "hover:border-(--border-strong)",

      // Left padding when a left-side icon exists
      Icon && "pl-9",
      // Right padding when right-side icons exist (password toggle, status)
      (showPasswordToggle || error || success) && "pr-9",
      sizes[inputSize],

      className,
    );

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className={twMerge(
              "text-sm font-medium transition-colors duration-150",
              "text-(--text-secondary)",
              error && "text-(--error)",
            )}
          >
            {label}
            {required && <span className="ml-1 text-(--error)">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {Icon && (
            <Icon
              className={twMerge(
                "pointer-events-none absolute left-3 h-5 w-5",
                error ? "text-(--error)" : "text-(--text-muted)",
              )}
            />
          )}

          <input
            id={inputId}
            ref={ref}
            type={showPassword ? "text" : type}
            className={inputClasses}
            aria-describedby={describedBy || undefined}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            {...props}
          />

          {/* Right side icons */}
          <div className="absolute right-3 flex items-center gap-2">
            {showPasswordToggle && type === "password" && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-(--text-muted) hover:text-(--text-primary) transition-colors focus-visible:ring-2 focus-visible:ring-(--accent) rounded-sm focus-visible:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            )}

            {error && <AlertCircle className="h-5 w-5 text-(--error) shrink-0" />}

            {success && <CheckCircle2 className="h-5 w-5 text-(--success) shrink-0" />}
          </div>
        </div>

        {hint && !error && (
          <p id={hintId} className="text-xs text-(--text-muted)">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="text-xs font-medium text-(--error) flex items-center gap-1"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

// Textarea component
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  success?: boolean;
  textareaSize?: "sm" | "md" | "lg";
  required?: boolean;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, hint, error, success, textareaSize = "md", required, showCount, className, ...props },
    ref,
  ) => {
    const textareaId = useId();
    const errorId = useId();
    const hintId = useId();
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
    const currentLength = typeof props.value === "string" ? props.value.length : 0;

    const sizes = {
      sm: "px-3 py-2 text-sm min-h-20",
      md: "px-4 py-3 text-sm min-h-28",
      lg: "px-4 py-3 text-base min-h-40",
    } as const;

    const textareaClasses = twMerge(
      // Base styles
      "w-full rounded-md border transition-all duration-150 ease-out resize-none",
      "bg-(--surface-input)",
      "text-(--text-primary)",
      "placeholder:text-(--text-muted)",
      // Border states
      "border-(--border-default)",
      "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-(--surface-base)",
      // Error state
      error && "border-(--error) focus:ring-(--error)",
      // Success state
      !error && success && "border-(--success) focus:ring-(--success)",
      // Normal focus
      !error && !success && "focus:ring-(--accent) focus:border-(--accent)",
      // Hover
      !error && !success && "hover:border-(--border-strong)",
      // Sizes
      sizes[textareaSize],
      className,
    );

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className={twMerge(
              "block text-sm font-medium transition-colors duration-150",
              "text-(--text-secondary)",
              error && "text-(--error)",
            )}
          >
            {label}
            {required && <span className="text-(--error) ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <textarea
            id={textareaId}
            ref={ref}
            className={textareaClasses}
            aria-describedby={describedBy || undefined}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            {...props}
          />
        </div>

        {(hint || (showCount && props.maxLength)) && !error && (
          <div className="flex items-center justify-between gap-2">
            {hint && (
              <p id={hintId} className="text-xs text-(--text-muted)">
                {hint}
              </p>
            )}
            {showCount && props.maxLength && (
              <p
                className="shrink-0 text-xs tabular-nums text-(--text-muted)"
                aria-live="polite"
                aria-atomic="true"
              >
                {currentLength} / {props.maxLength}
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="text-xs font-medium text-(--error) flex items-center gap-1"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  success?: boolean;
  selectSize?: "sm" | "md" | "lg";
  required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { id, label, hint, error, success, selectSize = "md", required, className, children, ...props },
    ref,
  ) => {
    const generatedSelectId = useId();
    const selectId = id ?? generatedSelectId;
    const errorId = useId();
    const hintId = useId();
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-4 text-base",
    } as const;

    const selectClasses = twMerge(
      "w-full rounded-md border transition-all duration-150 ease-out",
      "bg-(--surface-input)",
      "text-(--text-primary)",
      !error && !success && "border-(--border-default)",
      error && "border-(--error)",
      success && "border-(--success)",
      "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-(--surface-base)",
      !error && !success && "focus:ring-(--accent) focus:border-(--accent)",
      error && "focus:ring-(--error) focus:border-(--error)",
      success && "focus:ring-(--success) focus:border-(--success)",
      !error && !success && "hover:border-(--border-strong)",
      sizes[selectSize],
      className,
    );

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className={twMerge(
              "block text-sm font-medium transition-colors duration-150",
              "text-(--text-secondary)",
              error && "text-(--error)",
            )}
          >
            {label}
            {required && <span className="text-(--error) ml-1">*</span>}
          </label>
        )}

        <select
          id={selectId}
          ref={ref}
          className={selectClasses}
          aria-describedby={describedBy || undefined}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {children}
        </select>

        {hint && !error && (
          <p id={hintId} className="text-xs text-(--text-muted)">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="text-xs font-medium text-(--error) flex items-center gap-1"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";
