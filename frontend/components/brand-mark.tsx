import React from "react"

export function BrandMark({
    className,
    size = 32
}: {
    className?: string
    size?: number
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Outer seal texture */}
            <circle
                cx="50" cy="50" r="46"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray="8 4"
            />
            {/* Inner seal ring */}
            <circle
                cx="50" cy="50" r="38"
                stroke="currentColor"
                strokeWidth="1.5"
            />

            {/* Monoline 'M' resembling a crafted mark */}
            <path
                d="M 30 70 L 30 35 L 50 55 L 70 35 L 70 70"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Artisanal accent dot */}
            <circle cx="50" cy="22" r="4" fill="currentColor" />
        </svg>
    )
}

export function BrandWordmark({ className }: { className?: string }) {
    return (
        <span className={`font-display font-bold tracking-tight text-foreground ${className}`}>
            Mecerka
        </span>
    )
}
