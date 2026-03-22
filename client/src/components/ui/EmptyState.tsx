import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
    icon?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

/**
 * Empty state placeholder for lists, tables, and sections with no data
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
    ({ icon = "📭", title, description, action, className = "", ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
                {...props}
            >
                <span className="text-5xl mb-4 block">{icon}</span>
                <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
                {description && (
                    <p className="text-white/50 text-sm max-w-md leading-relaxed">{description}</p>
                )}
                {action && <div className="mt-4">{action}</div>}
            </div>
        );
    }
);

EmptyState.displayName = "EmptyState";
