import { useState, useEffect } from "react"

export function useNow(updateIntervalMs = 30000) {
    const [now, setNow] = useState(new Date())

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), updateIntervalMs)
        return () => clearInterval(interval)
    }, [updateIntervalMs])

    return now
}
