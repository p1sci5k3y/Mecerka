'use client';

import dynamic from 'next/dynamic';
import type { DeliveryMapProps } from './DeliveryMap';

const DeliveryMap = dynamic(() => import('./DeliveryMap'), {
    ssr: false,
    loading: () => <div className="h-[400px] w-full bg-muted animate-pulse rounded-lg" />,
});

export default function DynamicDeliveryMap(props: DeliveryMapProps) {
    return <DeliveryMap {...props} />
}
