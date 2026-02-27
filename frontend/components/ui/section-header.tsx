import React from "react"
import { cn } from "@/lib/utils"

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string
    subtitle?: string
}

export function SectionHeader({ title, subtitle, className, ...props }: SectionHeaderProps) {
    return (
        <div className={cn("relative flex flex-col gap-1 pb-4", className)} {...props}>
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">{title}</h2>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}

            {/* Notebook line decorative separator */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSIyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiNFOERFRDEiLz48L3N2Zz4=')] opacity-50" />
        </div>
    )
}
