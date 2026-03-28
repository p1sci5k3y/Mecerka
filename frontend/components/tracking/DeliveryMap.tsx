'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io, { Socket } from 'socket.io-client';
import { ordersService } from '@/lib/services/orders-service';
import { Play, Square, MapPin } from 'lucide-react';
import { getRoutingBaseUrl, getTrackingBaseUrl } from '@/lib/runtime-config';

type LeafletDefaultIconPrototype = typeof L.Icon.Default.prototype & {
    _getIconUrl?: unknown;
};

// Fix for default markers in Next.js
delete (L.Icon.Default.prototype as LeafletDefaultIconPrototype)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCustomIcon = (color: string) => {
    return new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
};

const originIcon = createCustomIcon('green');
const destIcon = createCustomIcon('red');
const runnerIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/5582/5582935.png', // Fallback runner icon
    iconSize: [35, 35],
    iconAnchor: [17, 35],
    popupAnchor: [0, -35],
});

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

function formatDistanceLabel(distanceKm: number | null) {
    if (distanceKm == null) return 'Sin estimación';
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
    return `${distanceKm.toFixed(1)} km`;
}

function formatEtaLabel(distanceKm: number | null) {
    if (distanceKm == null) return 'Pendiente de GPS';
    const minutes = Math.max(3, Math.round((distanceKm / 18) * 60));
    return `${minutes} min aprox.`;
}

type RouteProjection = {
    coordinates: [number, number][];
    distanceKm: number;
    etaMinutes: number;
};

function formatLastUpdateLabel(updatedAt: string | null) {
    if (!updatedAt) return 'Sin señal todavía';
    return new Date(updatedAt).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function FlyToRunner({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        if (lat && lng) {
            map.flyTo([lat, lng], 15, { duration: 1.5 });
        }
    }, [lat, lng, map]);
    return null;
}

// Simple geocoding helper (OpenStreetMap Nominatim)
async function geocode(address: string, fallbackLat: number, fallbackLng: number): Promise<{ lat: number, lng: number }> {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) {
        console.error("Geocoding failed for", address);
    }
    return { lat: fallbackLat, lng: fallbackLng };
}

async function fetchProjectedRoute(
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
): Promise<RouteProjection | null> {
    try {
        const routeUrl =
            `${getRoutingBaseUrl().replace(/\/$/, '')}/route/v1/driving/` +
            `${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        const res = await fetch(routeUrl);
        if (!res.ok) {
            throw new Error(`Route service unavailable (${res.status})`);
        }

        const data = await res.json() as {
            routes?: Array<{
                distance?: number;
                duration?: number;
                geometry?: {
                    coordinates?: Array<[number, number]>;
                };
            }>;
        };

        const route = data.routes?.[0];
        const geometry = route?.geometry?.coordinates;
        if (!route || !geometry || geometry.length === 0) {
            return null;
        }

        return {
            coordinates: geometry.map(([lng, lat]) => [lat, lng]),
            distanceKm: (route.distance ?? 0) / 1000,
            etaMinutes: Math.max(1, Math.round((route.duration ?? 0) / 60)),
        };
    } catch (error) {
        console.error('Route projection failed', error);
        return null;
    }
}

export interface DeliveryMapProps {
    orderId: number | string;
    initialLat?: number;
    initialLng?: number;
    isRunner?: boolean;
}

function runnerTrackingStatusLabel(status: string | null) {
    switch (status) {
        case 'RUNNER_ASSIGNED':
            return 'Esperando recogida operativa';
        case 'PICKUP_PENDING':
            return 'Ruta lista para recogida';
        case 'PICKED_UP':
        case 'IN_TRANSIT':
            return 'Transmitiendo reparto en curso';
        case 'DELIVERING':
            return 'Ruta activa';
        case 'DELIVERED':
            return 'Ruta cerrada por entrega completada';
        case 'CANCELLED':
            return 'Ruta cerrada por cancelación';
        default:
            return 'Esperando contexto operativo';
    }
}

export default function DeliveryMap({ orderId, initialLat = 40.4168, initialLng = -3.7038, isRunner }: DeliveryMapProps) {
    const [position, setPosition] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
    const [origin, setOrigin] = useState<{ lat: number; lng: number, label: string } | null>(null);
    const [destination, setDestination] = useState<{ lat: number; lng: number, label: string } | null>(null);
    const [routeHistory, setRouteHistory] = useState<[number, number][]>([]);
    const [error, setError] = useState<string | null>(null);
    const [trackingStatus, setTrackingStatus] = useState<string | null>(null);
    const [runnerName, setRunnerName] = useState<string | null>(null);
    const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
    const [projectedRoute, setProjectedRoute] = useState<[number, number][]>([]);
    const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
    const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);

    // Tracker State
    const [isTracking, setIsTracking] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const runnerCanTransmit =
        trackingStatus === 'PICKUP_PENDING' ||
        trackingStatus === 'PICKED_UP' ||
        trackingStatus === 'IN_TRANSIT' ||
        trackingStatus === null;
    const remainingDistanceKm = useMemo(() => {
        if (routeDistanceKm != null) return routeDistanceKm;
        if (!destination) return null;
        return calculateDistanceKm(position.lat, position.lng, destination.lat, destination.lng);
    }, [destination, position.lat, position.lng, routeDistanceKm]);
    const etaLabel = routeEtaMinutes != null ? `${routeEtaMinutes} min aprox.` : formatEtaLabel(remainingDistanceKm);

    // Initial Load & Socket Setup
    useEffect(() => {
        let isSubscribed = true;

        const initMapData = async () => {
            try {
                const [order, tracking] = await Promise.all([
                    ordersService.getOne(orderId),
                    ordersService.getTracking(orderId).catch(() => null),
                ]);
                const providerCity = order.items[0]?.product?.city || 'Madrid';
                const destAddress = order.deliveryAddress || order.city || 'Madrid';

                // We add small offsets just in case they resolve to the exact same center point
                const pLat = initialLat + 0.01;
                const pLng = initialLng - 0.01;
                const cLat = initialLat - 0.01;
                const cLng = initialLng + 0.01;

                const originCoords = await geocode(`${providerCity}, Spain`, pLat, pLng);
                const destCoords = await geocode(`${destAddress}, Spain`, cLat, cLng);

                if (isSubscribed) {
                    setOrigin({ ...originCoords, label: `Origen (Taller de ${order.items[0]?.product?.providerId})` });
                    setDestination({ ...destCoords, label: `Destino (${destAddress})` });
                    setTrackingStatus(tracking?.deliveryStatus ?? tracking?.status ?? null);
                    setRunnerName(tracking?.runner?.name ?? null);
                    setLastUpdateAt(tracking?.updatedAt ?? null);

                    if (tracking?.location) {
                        setPosition({ lat: tracking.location.lat, lng: tracking.location.lng });
                        setRouteHistory([[tracking.location.lat, tracking.location.lng]]);
                    } else {
                        setPosition(originCoords);
                        setRouteHistory([]);
                    }
                }

            } catch (err) {
                console.error("Error loading order for map", err);
            }
        };

        initMapData();

        // Connect WebSocket
        const newSocket = io(`${getTrackingBaseUrl()}/tracking`, {
            path: '/socket.io',
            transports: ['websocket'],
            withCredentials: true,
        });

        socketRef.current = newSocket;

        newSocket.on('connect', () => {
            console.log('Connected to Tracking Gateway');
            setError(null);
            newSocket.emit('joinOrder', { orderId });
        });

        newSocket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
            setError('No estás autorizado para visualizar la ruta de este pedido.');
        });

        newSocket.on('locationUpdated', (data: { lat: number; lng: number }) => {
            setPosition({ lat: data.lat, lng: data.lng });
            setRouteHistory((prev) => [...prev, [data.lat, data.lng]]);
            setLastUpdateAt(new Date().toISOString());
        });

        return () => {
            isSubscribed = false;
            newSocket.disconnect();
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [initialLat, initialLng, orderId]);

    useEffect(() => {
        if (!destination) {
            setProjectedRoute([]);
            setRouteDistanceKm(null);
            setRouteEtaMinutes(null);
            return;
        }

        const start =
            routeHistory.length > 0
                ? { lat: position.lat, lng: position.lng }
                : origin
                    ? { lat: origin.lat, lng: origin.lng }
                    : { lat: position.lat, lng: position.lng };

        let cancelled = false;
        void fetchProjectedRoute(start, destination).then((projection) => {
            if (cancelled) return;
            if (projection) {
                setProjectedRoute(projection.coordinates);
                setRouteDistanceKm(projection.distanceKm);
                setRouteEtaMinutes(projection.etaMinutes);
                return;
            }

            setProjectedRoute([
                [start.lat, start.lng],
                [destination.lat, destination.lng],
            ]);
            setRouteDistanceKm(calculateDistanceKm(start.lat, start.lng, destination.lat, destination.lng));
            setRouteEtaMinutes(null);
        });

        return () => {
            cancelled = true;
        };
    }, [destination, origin, position.lat, position.lng, routeHistory.length]);

    const toggleTracking = () => {
        if (!runnerCanTransmit) {
            setError('La ruta no está en una fase operativa que permita emitir GPS.');
            return;
        }

        if (isTracking) {
            // Stop tracking
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            setIsTracking(false);
        } else {
            // Start tracking
            if (!navigator.geolocation) {
                setError('Geolocalización no soportada en este dispositivo.');
                return;
            }

            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    setPosition({ lat: latitude, lng: longitude });
                    if (socketRef.current) {
                        socketRef.current.emit('updateLocation', { orderId, lat: latitude, lng: longitude });
                    }
                },
                (err) => {
                    setError('Error obteniendo GPS: ' + err.message);
                    setIsTracking(false);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );

            watchIdRef.current = watchId;
            setIsTracking(true);
        }
    };

    if (destination) {
        // We might want to connect runner to dest visually to show remaining path
        // For simplicity, we just rely on RouteHistory and let markers show endpoints
    }

    return (
        <div className="relative h-full w-full flex flex-col">
            {isRunner && (
                <div className="absolute top-4 right-4 z-[1000] bg-white dark:bg-slate-900 p-3 flex items-center gap-3 rounded-xl shadow-lg border border-border">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase text-slate-500">Modo Repartidor</span>
                        <span className="text-sm font-medium">
                            {isTracking ? 'Transmitiendo GPS' : runnerTrackingStatusLabel(trackingStatus)}
                        </span>
                    </div>
                    <button
                        onClick={toggleTracking}
                        disabled={!runnerCanTransmit && !isTracking}
                        className={`h-12 px-6 flex items-center gap-2 rounded-lg font-bold text-white transition-colors ${isTracking ? 'bg-red-500 hover:bg-red-600' : 'bg-[#df795d] hover:bg-[#c05e42]'
                            } ${!runnerCanTransmit && !isTracking ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                        {isTracking ? (
                            <><Square className="w-4 h-4" fill="currentColor" /> Detener</>
                        ) : !runnerCanTransmit ? (
                            <>Ruta cerrada</>
                        ) : (
                            <><Play className="w-4 h-4" fill="currentColor" /> Iniciar Ruta</>
                        )}
                    </button>
                </div>
            )}

            <div className="absolute left-4 top-4 z-[1000] max-w-sm rounded-xl border border-border bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-slate-900/95">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado</p>
                        <p className="text-sm font-semibold text-foreground">{runnerTrackingStatusLabel(trackingStatus)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">ETA orientativa</p>
                        <p className="text-sm font-semibold text-foreground">{etaLabel}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Distancia restante</p>
                        <p className="text-sm font-semibold text-foreground">{formatDistanceLabel(remainingDistanceKm)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Última señal</p>
                        <p className="text-sm font-semibold text-foreground">{formatLastUpdateLabel(lastUpdateAt)}</p>
                    </div>
                </div>
                <div className="mt-3 border-t border-border/70 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Runner</p>
                    <p className="text-sm font-semibold text-foreground">{runnerName || 'Asignación confirmada'}</p>
                </div>
            </div>

            {error && (
                <div className="absolute inset-x-4 top-4 z-[1000] flex items-center justify-between bg-destructive p-4 rounded-xl text-destructive-foreground font-bold shadow-lg">
                    <span className="flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        {error}
                    </span>
                    <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">✕</button>
                </div>
            )}

            <div className="flex-1 rounded-bl-xl rounded-br-xl overflow-hidden bg-slate-100 relative z-0">
                <MapContainer
                    center={[initialLat, initialLng]}
                    zoom={14}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {origin && (
                        <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
                            <Popup>{origin.label}</Popup>
                        </Marker>
                    )}

                    {destination && (
                        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
                            <Popup>{destination.label}</Popup>
                        </Marker>
                    )}

                    {/* Only show runner if location is known or has route history */}
                    {(routeHistory.length > 0 || isTracking) && (
                        <Marker position={[position.lat, position.lng]} icon={runnerIcon}>
                            <Popup>
                                Posición Actual del Repartidor <br />
                                {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                            </Popup>
                        </Marker>
                    )}

                    {/* Traced Route */}
                    {routeHistory.length > 0 && (
                        <Polyline positions={routeHistory} color="#df795d" weight={5} opacity={0.8} />
                    )}

                    {routeHistory.length === 0 && projectedRoute.length > 0 && (
                        <Polyline
                            positions={projectedRoute}
                            color="#94a3b8"
                            weight={3}
                            dashArray="8, 8"
                            opacity={0.55}
                        />
                    )}

                    {/* Projected Line To Destination */}
                    {projectedRoute.length > 1 && (routeHistory.length > 0 || isTracking) && (
                        <Polyline positions={projectedRoute} color="#81A16C" weight={3} dashArray="10, 10" opacity={0.6} />
                    )}

                    {(routeHistory.length > 0 || isTracking) && (
                        <FlyToRunner lat={position.lat} lng={position.lng} />
                    )}
                </MapContainer>
            </div>
        </div>
    );
}
