'use client';

import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RunnerSimulatorProps {
    readonly orderId: number;
}

interface LogEntry {
    id: string;
    message: string;
}

export default function RunnerSimulator({ orderId }: RunnerSimulatorProps) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [active, setActive] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const newSocket = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tracking`, {
            path: '/socket.io',
            transports: ['websocket'],
        });

        newSocket.on('connect', () => {
            addLog('Connected to Gateway');
            newSocket.emit('joinOrder', { orderId });
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [orderId]);

    const addLog = (msg: string) => setLogs((prev) => [{ id: Math.random().toString(36).slice(2, 11), message: msg }, ...prev].slice(0, 10));

    const startSimulation = () => {
        if (!socket) return;
        setActive(true);
        addLog('Starting simulation...');

        // Mock Route: Plaza Mayor -> Retiro
        const start = { lat: 40.4155, lng: -3.7074 };
        const end = { lat: 40.418, lng: -3.683 };
        let step = 0;
        const totalSteps = 100;

        const interval = setInterval(() => {
            if (step > totalSteps) {
                clearInterval(interval);
                setActive(false);
                addLog('Simulation finished');
                return;
            }

            const lat = start.lat + (end.lat - start.lat) * (step / totalSteps);
            const lng = start.lng + (end.lng - start.lng) * (step / totalSteps);

            // Add some random jitter
            const jitterLat = (Math.random() - 0.5) * 0.0001;
            const jitterLng = (Math.random() - 0.5) * 0.0001;

            const position = {
                orderId,
                lat: lat + jitterLat,
                lng: lng + jitterLng,
            };

            socket.emit('updateLocation', position);
            step++;
        }, 100); // 10 updates per second for smoothness
    };

    return (
        <Card className="w-full mt-4">
            <CardHeader>
                <CardTitle>Runner Simulator (Order #{orderId})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    <Button onClick={startSimulation} disabled={active || !socket}>
                        {active ? 'Running...' : 'Start Delivery Simulation'}
                    </Button>
                    <div className="bg-slate-950 text-slate-50 p-2 rounded text-xs font-mono h-32 overflow-y-auto">
                        {logs.map((log) => (
                            <div key={log.id}>{log.message}</div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
