import React, { useEffect, useState } from 'react';
import { ordersService } from '@/lib/services/orders-service';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Package, ShoppingBag, Box, TrendingUp, TrendingDown, Calendar, Receipt } from 'lucide-react';

export function ProviderDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({ totalRevenue: 0, totalOrders: 0, itemsSold: 0, averageTicket: 0 });
    const [salesData, setSalesData] = useState<any[]>([]);
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!user) return;
            try {
                const [statsData, chartData, ordersData] = await Promise.all([
                    ordersService.getProviderStats(),
                    ordersService.getSalesChart(),
                    ordersService.getAll() // Assuming this correctly filters in backend for the provider
                ]);
                setStats(statsData);
                setSalesData(chartData);
                setRecentOrders(ordersData.slice(0, 5));
            } catch (error) {
                console.error('Error loading provider dashboard:', error);
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

    return (
        <div className="animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col gap-2 mb-10">
                <h1 className="text-slate-900 dark:text-slate-100 text-5xl font-serif italic leading-tight">
                    Taller de {user?.name?.split(' ')[0] || 'Artesano'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                    Bienvenido de nuevo a tu espacio creativo y panel de gestión de Mecerka.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Facturación Mensual</p>
                        <Receipt className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">€{stats.totalRevenue.toFixed(2)}</p>
                    <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                        <TrendingUp className="w-4 h-4" />
                        <span>+12.5%</span>
                        <span className="text-slate-400 text-xs font-normal ml-1">vs mes ant.</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Pedidos Totales</p>
                        <ShoppingBag className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">{stats.totalOrders}</p>
                    <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                        <TrendingUp className="w-4 h-4" />
                        <span>+5.2%</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Productos Vendidos</p>
                        <Package className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">{stats.itemsSold}</p>
                    <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                        <TrendingUp className="w-4 h-4" />
                        <span>+8.1%</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl p-6 bg-white dark:bg-[#201512]/50 shadow-sm border border-[#df795d]/10 hover:border-[#df795d]/30 transition-all">
                    <div className="flex justify-between items-start">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Ticket Promedio</p>
                        <Receipt className="w-5 h-5 text-[#df795d]/60" />
                    </div>
                    <p className="text-slate-900 dark:text-slate-100 text-3xl font-bold font-serif">€{stats.averageTicket.toFixed(2)}</p>
                    <div className="flex items-center gap-1 text-rose-500 font-medium text-sm">
                        <TrendingDown className="w-4 h-4" />
                        <span>-2.4%</span>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-[#201512]/50 rounded-xl p-8 shadow-sm border border-[#df795d]/10 mb-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h2 className="text-slate-900 dark:text-slate-100 text-2xl font-serif font-bold">Tendencia de Ventas</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Actividad de los últimos 30 días de facturación</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <p className="text-[#df795d] text-2xl font-bold leading-none">€{stats.totalRevenue.toFixed(2)}</p>
                            <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">Total Periodo</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 border border-[#df795d]/20 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-[#df795d]/5 transition-colors">
                            <Calendar className="w-4 h-4" />
                            Últimos 30 días
                        </button>
                    </div>
                </div>
                <div className="h-[200px] w-full flex items-end justify-between gap-2 pt-10 border-b-2 border-[#df795d]/10 pb-2">
                    {salesData.length > 0 ? salesData.map((data, index) => {
                        const height = Math.max((data.amount / (Math.max(...salesData.map(d => d.amount)) || 1)) * 100, 5);
                        return (
                            <div key={index} className="w-full flex flex-col items-center justify-end gap-2 group">
                                <div
                                    className="w-full bg-[#df795d]/20 hover:bg-[#df795d] transition-all rounded-t-sm relative"
                                    style={{ height: `${height}%` }}
                                >
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                        €{data.amount.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="w-full h-full flex flex-col items-center justify-center opacity-30 gap-3 pb-8">
                            <TrendingUp className="h-10 w-10 text-[#df795d]" />
                            <p className="font-serif">No hay suficientes datos de ventas para mostrar la gráfica.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-[#201512]/50 rounded-xl shadow-sm border border-[#df795d]/10 overflow-hidden">
                <div className="p-6 border-b border-[#df795d]/10 flex justify-between items-center">
                    <h2 className="text-slate-900 dark:text-slate-100 text-xl font-serif font-bold">Últimos Pedidos</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#df795d]/5">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nº Pedido</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#df795d]/5">
                            {recentOrders.map((order) => (
                                <tr key={order.id} className="hover:bg-[#df795d]/5 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">#{order.id.slice(0, 8).toUpperCase()}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{new Date(order.createdAt).toLocaleDateString("es-ES")}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${order.status === 'CONFIRMED' || order.status === 'DELIVERED'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {order.status === 'CONFIRMED' ? 'Confirmado' : order.status === 'DELIVERED' ? 'Entregado' : 'Pendiente'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {recentOrders.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                                        Aún no hay pedidos en tu taller.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
