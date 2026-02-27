import React, { useEffect, useState } from 'react';
import { ordersService } from '@/lib/services/orders-service';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Route, CheckCircle, Clock, Navigation, MapPin, Truck, CheckCircle2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RunnerDashboard() {
    const { user } = useAuth();
    const [activeOrders, setActiveOrders] = useState<any[]>([]);
    const [completedOrders, setCompletedOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!user) return;
            try {
                const data = await ordersService.getAll(); // Filtered by runnerId in backend
                setActiveOrders(data.filter((o: any) => o.status !== 'DELIVERED'));
                setCompletedOrders(data.filter((o: any) => o.status === 'DELIVERED'));
            } catch (error) {
                console.error('Error loading runner dashboard:', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [user]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-[#df795d]" />
            </div>
        );
    }

    const earnings = completedOrders.reduce((sum, order) => {
        const orderTotal = order.items.reduce((acc: number, item: any) => acc + Number(item.priceAtPurchase) * item.quantity, 0);
        return sum + (orderTotal * 0.1); // Assuming 10% commission for the runner
    }, 0);

    const activeStop = activeOrders.length > 0 ? activeOrders[0] : null;

    const handleMarkDelivered = async (orderId: string) => {
        // In a real app we'd call an endpoint like completed
        // await ordersService.completeOrder(orderId);
        // Refresh
        setLoading(true);
        const data = await ordersService.getAll();
        setActiveOrders(data.filter((o: any) => o.status !== 'DELIVERED'));
        setCompletedOrders(data.filter((o: any) => o.status === 'DELIVERED'));
        setLoading(false);
    };

    return (
        <div className="animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col gap-2 mb-10">
                <h1 className="text-slate-900 dark:text-slate-100 text-5xl font-serif italic leading-tight">
                    Panel de Ruta - {user?.name?.split(' ')[0] || 'Repartidor'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                    Gestiona tus entregas y ganancias en Mecerka.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Entregas Completadas</p>
                        <CheckCircle className="w-5 h-5 text-[#81A16C]" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">{completedOrders.length}</p>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Ganancias (Aprox)</p>
                        <Route className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">€{earnings.toFixed(2)}</p>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Horas Activas</p>
                        <Clock className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">
                        {completedOrders.length > 0 ? (completedOrders.length * 0.5).toFixed(1) + 'h' : '0h'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white dark:bg-[#201512]/50 rounded-xl p-8 shadow-sm border border-[#df795d]/10">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-slate-900 dark:text-slate-100 text-2xl font-serif font-bold">Ruta Actual</h2>
                        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            En Servicio
                        </div>
                    </div>

                    <div className="relative border-l-2 border-dashed border-[#df795d]/30 pl-8 ml-4 space-y-10">
                        {activeOrders.slice(0, 3).map((order, idx) => (
                            <div key={order.id} className="relative">
                                <div className={`absolute -left-[41px] w-5 h-5 rounded-full border-4 flex items-center justify-center bg-background
                  ${idx === 0 ? 'border-[#df795d]' : 'border-slate-300'}
                `}>
                                    {idx === 0 && <div className="w-2 h-2 bg-[#df795d] rounded-full" />}
                                </div>
                                <div className={`p-5 rounded-xl border ${idx === 0 ? 'border-[#df795d]/50 bg-[#df795d]/5' : 'border-border/50 bg-background'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                                            Entrega a {order.user?.name || 'Cliente'}
                                        </h3>
                                        <span className="text-xs font-semibold px-2 py-1 bg-white border border-border rounded text-[#df795d]">
                                            #{order.id.slice(0, 8).toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-slate-500 text-sm flex items-center gap-2 mb-4">
                                        <MapPin className="w-4 h-4" /> {order.deliveryAddress || 'Dirección de envío no especificada'}
                                    </p>
                                    <p className="text-sm font-medium text-slate-700">
                                        {order.items.length} piezas artesanales preparadas.
                                    </p>
                                </div>
                            </div>
                        ))}
                        {activeOrders.length === 0 && (
                            <div className="text-slate-500 italic flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> No tienes entregas pendientes. ¡Buen trabajo!
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white dark:bg-[#201512]/50 rounded-xl p-6 shadow-sm border border-[#df795d]/10 sticky top-24">
                        <h2 className="text-slate-900 dark:text-slate-100 text-xl font-serif font-bold mb-6">Acción Rápida</h2>

                        {activeStop ? (
                            <div className="flex flex-col gap-6">
                                <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-100 dark:border-orange-900/30">
                                    <p className="text-xs uppercase tracking-widest text-[#df795d] mb-1 font-bold">En Progreso</p>
                                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">Orden #{activeStop.id.slice(0, 8).toUpperCase()}</p>
                                    <div className="mt-4 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                            {activeStop.items[0]?.product?.imageUrl ? (
                                                <img src={activeStop.items[0].product.imageUrl} alt="Item" className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="w-5 h-5" />
                                            )}
                                        </div>
                                        Recoger en taller y llevar a destino final.
                                    </div>
                                </div>

                                <Button className="w-full h-14 bg-[#81A16C] hover:bg-[#6b8c56] text-white text-lg font-bold flex items-center justify-center gap-2 shadow-sm rounded-xl" onClick={() => handleMarkDelivered(activeStop.id)}>
                                    <CheckCircle2 className="w-5 h-5" /> Marcar Entregado
                                </Button>

                                <Button variant="outline" className="w-full h-14 border-[#df795d]/20 text-slate-700 dark:text-slate-300 hover:bg-[#df795d]/5 text-lg font-bold flex items-center justify-center gap-2 rounded-xl">
                                    <Navigation className="w-5 h-5" /> Navegar al Destino
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-10 opacity-50">
                                <Truck className="w-16 h-16 mb-4" />
                                <p>No hay paradas activas para gestionar.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
