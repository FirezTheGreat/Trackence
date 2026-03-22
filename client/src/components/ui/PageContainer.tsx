import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
    fullHeight?: boolean;
}

/**
 * Standardized page container with consistent spacing
 */
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
    ({ fullHeight = true, className = "", children, ...props }, ref) => {
        const heightClass = fullHeight ? "min-h-screen" : "";
        const baseClasses = "px-16 pt-10 pb-16";

        return (
            <div ref={ref} className={`${heightClass} ${baseClasses} ${className}`} {...props}>
                {children}
            </div>
        );
    }
);

PageContainer.displayName = "PageContainer";
