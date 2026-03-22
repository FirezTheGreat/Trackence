import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

type CardVariant = "primary" | "subtle";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
    primary: "backdrop-blur-2xl bg-secondary/45 border border-white/20",
    subtle: "bg-white/5 border border-white/10",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ variant = "primary", className = "", children, ...props }, ref) => {
        const baseClasses = "rounded-xl p-6";

        return (
            <div
                ref={ref}
                className={`${baseClasses} ${variantClasses[variant]} ${className}`}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className = "", children, ...props }, ref) => {
        return (
            <div ref={ref} className={`mb-4 ${className}`} {...props}>
                {children}
            </div>
        );
    }
);

CardHeader.displayName = "CardHeader";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className = "", children, ...props }, ref) => {
        return (
            <div ref={ref} className={className} {...props}>
                {children}
            </div>
        );
    }
);

CardContent.displayName = "CardContent";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
    ({ className = "", children, ...props }, ref) => {
        return (
            <h2 ref={ref} className={`text-2xl font-bold text-white ${className}`} {...props}>
                {children}
            </h2>
        );
    }
);

CardTitle.displayName = "CardTitle";
