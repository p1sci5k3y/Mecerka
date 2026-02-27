'use client';

import dynamic from 'next/dynamic';

const DeliveryMap = dynamic(() => import('./DeliveryMap'), {
    ssr: false,
    loading: () => <div className="h-[400px] w-full bg-muted animate-pulse rounded-lg" />,
});

export default function DynamicDeliveryMap(props: any) {
    return <DeliveryMap {...props} />
}
