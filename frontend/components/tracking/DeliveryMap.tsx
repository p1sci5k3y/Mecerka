'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import io, { Socket } from 'socket.io-client';
import { ordersService } from '@/lib/services/orders-service';
import { Order } from '@/lib/types';
import { Loader2, Play, Square, MapPin } from 'lucide-react';

// Fix for default markers in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
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

interface DeliveryMapProps {
    orderId: number;
    initialLat?: number;
    initialLng?: number;
    token?: string | null;
    isRunner?: boolean;
}

export default function DeliveryMap({ orderId, initialLat = 40.4168, initialLng = -3.7038, token, isRunner }: DeliveryMapProps) {
    const [mounted, setMounted] = useState(false);
    const [position, setPosition] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
    const [origin, setOrigin] = useState<{ lat: number; lng: number, label: string } | null>(null);
    const [destination, setDestination] = useState<{ lat: number; lng: number, label: string } | null>(null);
    const [routeHistory, setRouteHistory] = useState<[number, number][]>([]);
    const [error, setError] = useState<string | null>(null);

    // Tracker State
    const [isTracking, setIsTracking] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Initial Load & Socket Setup
    useEffect(() => {
        setMounted(true);
        if (!token) {
            setError('Esperando autenticación...');
            return;
        }

        let isSubscribed = true;

        const initMapData = async () => {
            try {
                // Fetch Order Details for Origin and Destination
                const order = await ordersService.getOne(orderId);
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

                    // Center map initially around origin if no runner position
                    if (routeHistory.length === 0) {
                        setPosition(originCoords);
                    }
                }

            } catch (err) {
                console.error("Error loading order for map", err);
            }
        };

        initMapData();

        // Connect WebSocket
        const newSocket = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tracking`, {
            path: '/socket.io',
            transports: ['websocket'],
            auth: { token },
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
        });

        return () => {
            isSubscribed = false;
            newSocket.disconnect();
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId, token]);

    const toggleTracking = () => {
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

    if (!mounted) return null;

    // Build visualization lines: Origin -> Current Runner -> Destination
    const routeLines: [number, number][] = [];
    if (origin) routeLines.push([origin.lat, origin.lng]);
    if (position) routeLines.push([position.lat, position.lng]);
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
                        <span className="text-sm font-medium">{isTracking ? 'Transmitiendo GPS' : 'GPS Detenido'}</span>
                    </div>
                    <button
                        onClick={toggleTracking}
                        className={`h-12 px-6 flex items-center gap-2 rounded-lg font-bold text-white transition-colors ${isTracking ? 'bg-red-500 hover:bg-red-600' : 'bg-[#df795d] hover:bg-[#c05e42]'
                            }`}
                    >
                        {isTracking ? (
                            <><Square className="w-4 h-4" fill="currentColor" /> Detener</>
                        ) : (
                            <><Play className="w-4 h-4" fill="currentColor" /> Iniciar Ruta</>
                        )}
                    </button>
                </div>
            )}

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

                    {/* Projected Line To Destination */}
                    {destination && position && (routeHistory.length > 0 || isTracking) && (
                        <Polyline positions={[[position.lat, position.lng], [destination.lat, destination.lng]]} color="#81A16C" weight={3} dashArray="10, 10" opacity={0.6} />
                    )}

                    {(routeHistory.length > 0 || isTracking) && (
                        <FlyToRunner lat={position.lat} lng={position.lng} />
                    )}
                </MapContainer>
            </div>
        </div>
    );
}
