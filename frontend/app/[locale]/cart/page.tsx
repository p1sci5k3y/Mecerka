"use client"

import { useState } from "react"
import { useRouter } from "@/lib/navigation"
import {
  Trash2,
  Minus,
  Plus,
  ArrowRight,

  Inbox,
  MapPin,
  Truck,
  Loader2,
  CreditCard,
} from "lucide-react"
import { StripeCheckoutWrapper } from "./stripe-checkout"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/contexts/cart-context"
import { ordersService } from "@/lib/services/orders-service"
import { authService } from "@/lib/services/auth-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { SealBadge } from "@/components/ui/seal-badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export default function CartPage() {
  return <CartContent />
}

function CartContent() {
  const {
    items,
    totalItems,
    totalPrice,
    removeItem,
    updateQuantity,
    clearCart,
  } = useCart()
  const { user } = useAuth()
  const router = useRouter()
  const [checkingOut, setCheckingOut] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [showPinModal, setShowPinModal] = useState(false)
  const [clientSecret, setClientSecret] = useState("")
  const [stripeAccountId, setStripeAccountId] = useState("")

  const redirectToLoginForCheckout = () => {
    toast.info(
      "Puedes preparar tu cesta sin cuenta, pero necesitas iniciar sesión para completar el pago.",
      { icon: "🔐" },
    )
    router.push("/login?returnTo=%2Fcart")
  }

  const startCheckoutFlow = async () => {
    let checkoutUser = user
    if (!checkoutUser) {
      try {
        checkoutUser = await authService.getProfile()
      } catch (error: any) {
        if (error?.statusCode === 401) {
          redirectToLoginForCheckout()
          return
        }

        toast.error(
          error.message || "No pudimos validar tu sesión para continuar con la compra.",
          { icon: "🛠️" },
        )
        return
      }
    }

    if (!checkoutUser.roles.includes("CLIENT")) {
      toast.error("El checkout actual está disponible para cuentas cliente.", {
        icon: "🧾",
      })
      return
    }

    if (!deliveryAddress.trim()) {
      toast.error("Por favor, indícanos dónde entregarlo para que el repartidor pueda llegar.", {
        icon: "📍"
      })
      return
    }

    setCheckingOut(true)
    try {
      const payload = {
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
        deliveryAddress: deliveryAddress.trim(),
      }

      const createdOrder = await ordersService.create(payload)

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/payments/intent/${createdOrder.id}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al conectar con la pasarela de pago segura');
      }

      const data = await res.json();
      setClientSecret(data.clientSecret);
      setStripeAccountId(data.stripeAccountId);
      setShowPinModal(true)
    } catch (error: any) {
      toast.error(error.message || "Tuvimos un problema procesando tu compra.", { icon: "🛠️" })
    } finally {
      setCheckingOut(false)
    }
  }

  const handleSuccessfulPayment = () => {
    clearCart()
    setShowPinModal(false)
    toast.success("¡Pedido confirmado! Los talleres ya están preparándolo.", { icon: "🎉" })
    router.push("/dashboard")
  }

  const itemsMessage = totalItems === 0
    ? "Aún no has seleccionado ninguna pieza."
    : `Tienes ${totalItems} artículo${totalItems > 1 ? "s" : ""} esperando.`

  return (
    <div className="flex min-h-screen flex-col bg-background/50">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="font-display text-4xl font-extrabold text-foreground">
              Tu Cesta
            </h1>
            <p className="text-lg text-muted-foreground font-medium">
              {itemsMessage}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="mt-16 flex flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-border p-12 bg-card/50">
              <Inbox className="h-20 w-20 text-muted-foreground/30" />
              <div className="text-center">
                <h3 className="text-xl font-bold">La cesta está vacía</h3>
                <p className="mt-2 text-muted-foreground max-w-md">
                  Es un buen momento para explorar lo que los artesanos de tu ciudad han creado hoy.
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="mt-4 border-2 border-primary/20 text-primary hover:bg-primary/5 shadow-sm font-semibold"
                onClick={() => router.push("/products")}
              >
                Explorar el mercado
              </Button>
            </div>
          ) : (
            <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-start">

              {/* Items list / Left Column */}
              <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
                <div className="flex flex-col gap-4">
                  {items.map((item) => (
                    <div
                      key={item.product.id}
                      className="group flex flex-col sm:flex-row sm:items-center gap-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted/30 border border-border/50 overflow-hidden">
                        {item.product.imageUrl ? (
                          <img src={item.product.imageUrl} alt={item.product.name} className="object-cover w-full h-full" />
                        ) : (
                          <img src="https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80&w=600&auto=format&fit=crop" alt="Artesanía por defecto" className="object-cover w-full h-full opacity-80" />
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-1.5">
                        <h3 className="text-lg font-bold text-foreground leading-tight">
                          {item.product.name}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          Taller en {item.product.city}
                        </p>
                        <p className="text-base font-semibold text-primary mt-1">
                          {item.product.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-4 mt-4 sm:mt-0 border-t sm:border-t-0 border-border/50 pt-4 sm:pt-0">
                        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background px-1 py-1 shadow-sm">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-foreground">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-lg font-extrabold text-foreground sm:min-w-[5rem] text-right">
                            {(item.product.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </span>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => removeItem(item.product.id)}
                            title="Eliminar pieza"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping configuration */}
                <div className="mt-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    Entrega y Pago
                  </h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="address" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Dirección para la entrega
                      </Label>
                      <Input
                        id="address"
                        placeholder="Calle, Número, Piso..."
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        disabled={checkingOut}
                        className="h-12 text-base rounded-xl border-2 focus-visible:ring-primary"
                      />
                    </div>

                    <div className="mt-2 flex flex-col gap-3">
                      <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Método de Pago
                      </Label>
                      <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
                        <span className="font-bold flex items-center gap-2 w-full">
                          <CreditCard className="h-5 w-5 text-primary" />
                          Tarjeta / Apple Pay
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground leading-relaxed">
                          Pago online seguro a través de Stripe. El checkout actual admite un único taller por pedido.
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Order summary / Right Column (Ticket style) */}
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="sticky top-24 relative overflow-hidden rounded-md bg-[#FBF6EE] px-8 pt-10 pb-12 shadow-md border border-border/40"
                  style={{
                    borderImage: "repeating-linear-gradient(0deg, transparent, transparent 4px, #e8ded1 4px, #e8ded1 8px) 1",
                    borderLeft: "1px solid #e8ded1",
                    borderRight: "1px solid #e8ded1",
                    borderTop: "1px solid #e8ded1"
                  }}>

                  {/* Decorative zig-zag bottom for receipt look */}
                  <div className="absolute bottom-0 left-0 right-0 h-3 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHBhdGggZD0iTTAgMTBMNSAwTDEwIDEwWiIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==')] opacity-50" />

                  <div className="flex justify-center mb-6">
                    <SealBadge className="shadow-none border-primary bg-transparent text-primary">TICKET DE COMPRA</SealBadge>
                  </div>

                  <div className="flex flex-col gap-4 font-mono text-sm text-foreground/80 mb-8 border-b border-dashed border-border/80 pb-6">
                    {items.map((item) => (
                      <div key={`ticket-${item.product.id}`} className="flex justify-between items-start gap-4">
                        <span className="flex-1 leading-snug">
                          {item.quantity}x {item.product.name}
                        </span>
                        <span className="font-semibold text-foreground">
                          {(item.product.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-4 font-mono">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal piezas</span>
                      <span className="font-medium text-foreground">
                        {totalPrice.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>

                    <div className="border-t-2 border-primary/20 pt-4 mt-2">
                      <div className="flex justify-between items-end">
                        <span className="font-bold text-foreground">Pago online actual</span>
                        <span className="font-display text-3xl font-black text-primary">
                          {totalPrice.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="mt-10 w-full gap-2 h-14 text-base font-bold shadow-sm rounded-xl"
                    size="lg"
                    onClick={startCheckoutFlow}
                    disabled={checkingOut}
                  >
                    {checkingOut ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Validando con el taller...
                      </>
                    ) : (
                      <>
                        Confirmar y Pagar
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </Button>

                  <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
                    Puedes preparar tu cesta sin iniciar sesión. Te pediremos acceso justo antes de confirmar la compra.
                  </p>
                  <p className="mt-2 text-center text-xs text-muted-foreground leading-relaxed">
                    El flujo de pago online actual cubre las piezas del taller y admite un único proveedor por pedido.
                  </p>

                  <p className="text-center text-xs text-muted-foreground font-mono mt-6 leading-relaxed">
                    Al confirmar, apoyas al comercio local.<br />
                    ID de sesión: #{Math.floor(Math.random() * 100000)}
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* Transaction Modal (PIN for Cash OR Stripe Elements for Card) */}
      <Dialog open={showPinModal} onOpenChange={(open) => {
        if (!open && checkingOut) return; // Prevent closing if processing
        setShowPinModal(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Pago Seguro</DialogTitle>
            <DialogDescription>
              Introduce tus datos de pago de forma segura a través de Stripe.
            </DialogDescription>
          </DialogHeader>

          {clientSecret && stripeAccountId && (
            <div className="py-4">
              <StripeCheckoutWrapper
                clientSecret={clientSecret}
                stripeAccountId={stripeAccountId}
                totalAmount={totalPrice}
                onPaymentSuccess={handleSuccessfulPayment}
              />
            </div>
          )}

          {!clientSecret || !stripeAccountId ? (
            <div className="py-8 flex flex-col items-center justify-center gap-4">
              <p className="text-sm font-medium text-destructive text-center max-w-sm">
                No se pudo cargar la pasarela de pago.
              </p>
              <Button variant="outline" size="sm" onClick={() => {
                setShowPinModal(false);
                toast.error("Vuelve a intentarlo desde la cesta.");
              }}>
                Volver y Reintentar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
