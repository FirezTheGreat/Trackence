import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "accent";
type BadgeSize = "sm" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    size?: BadgeSize;
    dot?: boolean;
    pulse?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
    default: "bg-white/10 text-white/70 border-white/20",
    success: "bg-green-500/20 text-green-300 border-green-500/30",
    warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    danger: "bg-red-500/20 text-red-300 border-red-500/30",
    info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    accent: "bg-accent/20 text-accent border-accent/30",
};

const sizeClasses: Record<BadgeSize, string> = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
};

const dotVariantClasses: Record<BadgeVariant, string> = {
    default: "bg-white/60",
    success: "bg-green-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    info: "bg-blue-400",
    accent: "bg-accent",
};

/**
 * Badge / Chip component for status indicators, labels, tags
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
    (
        {
            variant = "default",
            size = "sm",
            dot = false,
            pulse = false,
            className = "",
            children,
            ...props
        },
        ref
    ) => {
        return (
            <span
                ref={ref}
                className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
                {...props}
            >
                {dot && (
                    <span className="relative flex h-2 w-2">
                        {pulse && (
                            <span
                                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotVariantClasses[variant]}`}
                            />
                        )}
                        <span
                            className={`relative inline-flex h-2 w-2 rounded-full ${dotVariantClasses[variant]}`}
                        />
                    </span>
                )}
                {children}
            </span>
        );
    }
);

Badge.displayName = "Badge";
