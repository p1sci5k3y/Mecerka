import React from "react"
import { cn } from "@/lib/utils"
import { Box } from "lucide-react"

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string
    description?: string
    icon?: React.ReactNode
    action?: React.ReactNode
}

export function EmptyState({ title, description, icon, action, className, ...props }: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center shadow-sm",
                className
            )}
            {...props}
        >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/20 text-secondary">
                {icon || <Box className="h-8 w-8 opacity-80" />}
            </div>
            <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
            {description && (
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
            )}
            {action && <div className="mt-6">{action}</div>}
        </div>
    )
}
