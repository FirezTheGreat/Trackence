import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    /** Width - can be tailwind class or CSS value */
    width?: string;
    /** Height - can be tailwind class or CSS value */
    height?: string;
    /** Make it circular */
    circle?: boolean;
}

/**
 * Loading skeleton placeholder with shimmer animation
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
    ({ width, height, circle = false, className = "", style, ...props }, ref) => {
        const shapeClass = circle ? "rounded-full" : "rounded-lg";

        return (
            <div
                ref={ref}
                className={`animate-skeleton bg-white/10 ${shapeClass} ${className}`}
                style={{
                    width: width,
                    height: height,
                    ...style,
                }}
                {...props}
            />
        );
    }
);

Skeleton.displayName = "Skeleton";

/**
 * Pre-built skeleton card for consistent loading states
 */
export function SkeletonCard() {
    return (
        <div className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-[20px] p-6 shadow-md space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton circle width="48px" height="48px" />
                <div className="flex-1 space-y-2">
                    <Skeleton height="20px" className="w-3/4" />
                    <Skeleton height="14px" className="w-1/2" />
                </div>
            </div>
            <Skeleton height="14px" className="w-full" />
            <Skeleton height="14px" className="w-5/6" />
        </div>
    );
}

/**
 * Pre-built skeleton row for tables/lists
 */
export function SkeletonRow() {
    return (
        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
            <Skeleton circle width="36px" height="36px" />
            <div className="flex-1 space-y-2">
                <Skeleton height="16px" className="w-2/3" />
                <Skeleton height="12px" className="w-1/3" />
            </div>
            <Skeleton height="28px" width="80px" />
        </div>
    );
}

/**
 * Skeleton grid for stat cards
 */
export function SkeletonStats({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-[20px] p-6 shadow-md space-y-3"
                >
                    <Skeleton height="14px" className="w-1/2" />
                    <Skeleton height="32px" className="w-2/3" />
                    <Skeleton height="12px" className="w-3/4" />
                </div>
            ))}
        </div>
    );
}
