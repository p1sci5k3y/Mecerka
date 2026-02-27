import React from "react"
import { cn } from "@/lib/utils"

export interface TagChipProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "outline" | "accent"
}

export function TagChip({ className, variant = "default", children, ...props }: TagChipProps) {
    const variants = {
        default: "bg-primary/10 text-primary border border-primary/20",
        outline: "bg-transparent text-foreground border border-border",
        accent: "bg-accent/20 text-accent-foreground border border-accent/30",
    }

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                variants[variant],
                className
            )}
            {...props}
        >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {children}
        </span>
    )
}
