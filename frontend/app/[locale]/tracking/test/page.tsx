'use client';

import dynamic from 'next/dynamic';
import RunnerSimulator from '@/components/tracking/RunnerSimulator';

const DynamicDeliveryMap = dynamic(() => import('@/components/tracking/DynamicDeliveryMap'), {
    ssr: false,
});

export default function TrackingTestPage() {
    const orderId = 999; // Mock Order ID

    return (
        <div className="container mx-auto p-4 space-y-8">
            <h1 className="text-3xl font-bold">Real-Time Tracking Test (Slice R-TRACK-01)</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Map */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Client View (Map)</h2>
                    <DynamicDeliveryMap orderId={orderId} initialLat={40.4155} initialLng={-3.7074} />
                    <p className="text-sm text-slate-500">
                        Map shows the live position of the runner. It listens to WebSocket events.
                    </p>
                </div>

                {/* Right Column: Simulator */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Runner View (Simulation)</h2>
                    <RunnerSimulator orderId={orderId} />
                    <p className="text-sm text-slate-500">
                        Click "Start" to simulate a runner moving from Plaza Mayor to Retiro.
                    </p>
                </div>
            </div>
        </div>
    );
}
