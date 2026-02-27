"use client"

import { useState } from "react"
import { useRouter } from "@/lib/navigation"
import {
  Trash2,
  Minus,
  Plus,
  ArrowRight,
  Loader2,
  Inbox,
  MapPin,
  Truck,
  Store,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/contexts/cart-context"
import { ordersService } from "@/lib/services/orders-service"
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
  DialogFooter,
} from "@/components/ui/dialog"

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartContent />
    </ProtectedRoute>
  )
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
  const [shippingSplit, setShippingSplit] = useState<"client" | "split">("client")
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinValue, setPinValue] = useState("")

  const startCheckoutFlow = () => {
    if (!deliveryAddress.trim()) {
      toast.error("Por favor, indícanos dónde entregarlo para que el repartidor pueda llegar.", {
        icon: "📍"
      })
      return
    }

    // Check if user has PIN
    if (user && !user.hasPin) {
      toast.error("Debes configurar un PIN transaccional en tu Ficha Personal antes de comprar.", {
        icon: "🔐",
        action: {
          label: "Configurar PIN",
          onClick: () => router.push("/profile")
        }
      })
      return
    }

    setPinValue("")
    setShowPinModal(true)
  }

  const submitOrderWithPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinValue || pinValue.length < 4) {
      toast.error("Por favor, introduce tu PIN de compra válido.")
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
        pin: pinValue,
      }
      await ordersService.create(payload)
      clearCart()
      setShowPinModal(false)
      toast.success("¡Pedido firmado y confirmado! Los talleres ya están preparando tus artículos.", {
        icon: "🎉"
      })
      router.push("/dashboard")
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.status === 401) {
        toast.error("El PIN introducido es incorrecto.")
      } else {
        toast.error(error.message || "¡Vaya! Tuvimos un problema temporal conectando con los talleres.", {
          icon: "🛠️"
        })
      }
    } finally {
      setCheckingOut(false)
    }
  }

  // Calculate simulated shipping cost based on items
  const baseShipping = 4.50
  const activeShippingCost = shippingSplit === "split" ? baseShipping / 2 : baseShipping

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
              {totalItems === 0
                ? "Aún no has seleccionado ninguna pieza."
                : `Tienes ${totalItems} artículo${totalItems > 1 ? "s" : ""} esperando.`}
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
                    Opciones de Entrega
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
                        Aportación logística (Modelo Justo)
                      </Label>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setShippingSplit("client")}
                          className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all ${shippingSplit === "client"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/60 hover:border-border/80"
                            }`}
                        >
                          <span className="font-bold flex justify-between w-full">
                            Asumir completo <span className="text-primary">+4,50 €</span>
                          </span>
                          <span className="text-xs text-muted-foreground leading-relaxed">Pagas el 100% del envío al repartidor de tu ciudad. El taller no asume costes.</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShippingSplit("split")}
                          className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all ${shippingSplit === "split"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/60 hover:border-border/80"
                            }`}
                        >
                          <span className="font-bold flex justify-between w-full">
                            Envío Compartido <span className="text-primary">+2,25 €</span>
                          </span>
                          <span className="text-xs text-muted-foreground leading-relaxed">Pagas la mitad y el artesano asume el resto. Opción solidaria.</span>
                        </button>
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
                    <div className="flex justify-between text-muted-foreground">
                      <span>Logística (Repartidor)</span>
                      <span className="font-medium text-foreground">
                        +{activeShippingCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>

                    <div className="border-t-2 border-primary/20 pt-4 mt-2">
                      <div className="flex justify-between items-end">
                        <span className="font-bold text-foreground">Total a Pagar</span>
                        <span className="font-display text-3xl font-black text-primary">
                          {(totalPrice + activeShippingCost).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
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

      {/* Transaction PIN Modal */}
      <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Confirmar Pedido</DialogTitle>
            <DialogDescription>
              Firma esta transacción introduciendo tu PIN de seguridad (4-6 dígitos).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitOrderWithPin} className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin-input" className="sr-only">PIN de Compra</Label>
              <Input
                id="pin-input"
                type="password"
                maxLength={6}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                placeholder="****"
                className="text-center text-2xl tracking-widest font-mono h-14 rounded-xl"
                autoFocus
              />
            </div>
            <DialogFooter className="mt-4 sm:justify-center">
              <Button
                type="submit"
                size="lg"
                className="w-full text-base font-bold h-12 rounded-xl shadow-sm"
                disabled={checkingOut}
              >
                {checkingOut ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  `Pagar ${(totalPrice + activeShippingCost).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
