import React, { useEffect, useState } from 'react';
import { ordersService } from '@/lib/services/orders-service';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, HeartHandshake, Users, ShoppingBag, Truck, Receipt, ArrowRight, Package, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import type { Order } from '@/lib/types';

const statusConfig: Record<string, { label: string; icon: React.ElementType }> = {
    PENDING: { label: "Recibido", icon: CheckCircle2 },
    CONFIRMED: { label: "Preparando", icon: Package },
    SHIPPED: { label: "En Camino", icon: Truck },
    DELIVERED: { label: "Entregado", icon: Receipt },
    CANCELLED: { label: "Cancelado", icon: XCircle }
};

export function ClientDashboard() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!user) return;
            try {
                const data = await ordersService.getAll();
                setOrders(data);
            } catch (error) {
                console.error('Error loading client dashboard:', error);
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

    const activeOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const pastOrders = orders.filter(o => o.status === 'DELIVERED' || o.status === 'CANCELLED');

    // Calculate impact metrics
    const totalSpent = pastOrders.reduce((sum, order) => {
        const orderTotal = order.items.reduce((acc, item) => acc + Number(item.priceAtPurchase) * item.quantity, 0);
        return sum + orderTotal;
    }, 0);

    // In a real query we'd group by providerId, here we'll mock based on orders
    const artisansSupported = new Set(orders.flatMap(o => o.items.map(i => i.product.providerId))).size;

    return (
        <div className="animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col gap-2 mb-10">
                <h1 className="text-slate-900 dark:text-slate-100 text-5xl font-serif italic leading-tight">
                    Cuaderno de Pedidos - {user?.name?.split(' ')[0] || 'Cliente'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                    Tu rincón personal donde apoyas el talento y la artesanía local.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Inversión Local</p>
                        <HeartHandshake className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">€{totalSpent.toFixed(2)}</p>
                    <div className="flex items-center gap-1 text-[#df795d] font-medium text-sm mt-1">
                        Reinvertido en tu comunidad.
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Artesanos Apoyados</p>
                        <Users className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">{artisansSupported > 0 ? artisansSupported : 0}</p>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Pedidos Activos</p>
                        <ShoppingBag className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">{activeOrders.length}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-8 flex flex-col gap-10">
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">Último Encargo</h2>
                            <Link href="/profile" className="text-sm font-medium text-[#df795d] hover:underline">Historial Completo</Link>
                        </div>

                        {activeOrders.length === 0 && pastOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-xl bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 py-20 text-center">
                                <ShoppingBag className="h-16 w-16 text-slate-300 dark:text-slate-700 mb-4" />
                                <h3 className="font-serif text-2xl mb-2 text-slate-900 dark:text-slate-100">Aún no tienes pedidos</h3>
                                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
                                    Descubre artesanos cercanos y empieza a apoyar el comercio local con Mecerka.
                                </p>
                                <Button asChild className="bg-[#df795d] hover:bg-[#c05e42] text-white rounded-lg px-6 shadow-md">
                                    <Link href="/products">Explorar Catálogo</Link>
                                </Button>
                            </div>
                        ) : (
                            (activeOrders.length > 0 ? activeOrders : pastOrders).slice(0, 1).map((order) => {
                                const config = statusConfig[order.status] || statusConfig.PENDING;
                                return (
                                    <div key={order.id} className="relative overflow-hidden rounded-xl bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/20">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#df795d]/80 to-[#81A16C]/80"></div>
                                        <div className="flex flex-col md:flex-row">
                                            <div
                                                className="w-full md:w-2/5 h-64 md:h-auto bg-cover bg-center border-r border-[#df795d]/10"
                                                style={{ backgroundImage: `url('${order.items[0]?.product?.imageUrl || 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80'}')` }}
                                            ></div>
                                            <div className="p-8 flex-1 flex flex-col justify-between relative">
                                                <div>
                                                    <p className="text-xs uppercase tracking-widest text-[#df795d] mb-2 font-bold flex items-center gap-2">
                                                        Ticket de Compra <span className="opacity-40">#{order.id.slice(0, 8).toUpperCase()}</span>
                                                    </p>
                                                    <h3 className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">
                                                        {order.items[0]?.product?.name || "Pieza Artesanal"} {order.items.length > 1 && `y ${order.items.length - 1} más`}
                                                    </h3>

                                                    {/* Progress Tracker */}
                                                    <div className="mb-8 relative pt-2">
                                                        <div className="absolute top-[15px] left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10"></div>
                                                        <div className="absolute top-[15px] left-0 h-0.5 bg-[#df795d] -z-10 transition-all duration-1000"
                                                            style={{ width: order.status === 'DELIVERED' ? '100%' : order.status === 'SHIPPED' ? '66%' : order.status === 'CONFIRMED' ? '33%' : '5%' }}></div>

                                                        <div className="flex justify-between">
                                                            {['Recibido', 'Taller', 'En Camino', 'Entregado'].map((step, idx) => {
                                                                const isActive =
                                                                    (order.status === 'DELIVERED') ||
                                                                    (order.status === 'SHIPPED' && idx <= 2) ||
                                                                    (order.status === 'CONFIRMED' && idx <= 1) ||
                                                                    (idx === 0);

                                                                return (
                                                                    <div key={idx} className="flex flex-col items-center gap-2">
                                                                        <div className={`w-4 h-4 rounded-full border-2 ${isActive ? 'bg-[#df795d] border-[#df795d]' : 'bg-white dark:bg-[#201512] border-slate-200 dark:border-slate-700'}`}></div>
                                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-[#df795d]' : 'text-slate-400'}`}>{step}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-4 pt-6 border-t border-[#df795d]/10 flex items-center justify-between z-10">
                                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#df795d] transition-colors cursor-pointer">
                                                        <Receipt className="w-4 h-4" />
                                                        Ver Recibo Completo
                                                    </span>
                                                    <Button asChild className="bg-[#df795d] hover:bg-[#c05e42] text-white px-6 rounded-lg text-sm transition-colors shadow-sm flex items-center gap-2">
                                                        <Link href={`/orders/${order.id}/track`}>
                                                            Seguir Envío
                                                            <ArrowRight className="w-4 h-4" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
