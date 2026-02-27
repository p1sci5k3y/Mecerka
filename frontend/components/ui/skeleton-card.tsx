import React from "react"
import { cn } from "@/lib/utils"

export function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm", className)}
            {...props}
        >
            <div className="h-40 w-full animate-pulse rounded-md bg-muted/50" />
            <div className="flex flex-col gap-2">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="mt-2 flex items-center justify-between">
                <div className="h-6 w-16 animate-pulse rounded-full bg-secondary/20" />
                <div className="h-4 w-12 animate-pulse rounded bg-muted/60" />
            </div>
        </div>
    )
}
