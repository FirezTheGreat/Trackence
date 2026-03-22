import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type ButtonSize = "sm" | "md" | "lg";
type ButtonVariant = "primary" | "secondary" | "danger" | "success";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    size?: ButtonSize;
    variant?: ButtonVariant;
    fullWidth?: boolean;
}

const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
};

const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-accent hover:bg-accent/80 text-white font-semibold",
    secondary: "bg-white/10 hover:bg-white/20 text-white border border-white/20",
    danger: "bg-red-600 hover:bg-red-700 text-white font-semibold",
    success: "bg-green-600 hover:bg-green-700 text-white font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            size = "md",
            variant = "primary",
            fullWidth = false,
            className = "",
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        const baseClasses =
            "rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
        const widthClass = fullWidth ? "w-full" : "";

        return (
            <button
                ref={ref}
                className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
                disabled={disabled}
                {...props}
            >
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";
