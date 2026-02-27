import React from "react"
import { cn } from "@/lib/utils"

export interface SealBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
}

export function SealBadge({ className, children, ...props }: SealBadgeProps) {
    return (
        <div
            className={cn(
                "relative inline-flex items-center justify-center rounded-full border-2 border-primary border-dashed bg-background px-3 py-1 text-sm font-bold text-primary shadow-sm",
                "before:absolute before:inset-0 before:rounded-full before:border before:border-primary/30",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}
