"use client"

import { useMemo, useState } from "react"
import { useRouter } from "@/lib/navigation"
import { useLocale } from "next-intl"
import {
  ArrowRight,
  Inbox,
  Loader2,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  UserRoundCheck,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/contexts/cart-context"
import { cartService } from "@/lib/services/cart-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

function buildIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `cart-checkout-${Date.now()}`
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message
  }

  return fallback
}

export default function CartPage() {
  return <CartContent />
}

function CartContent() {
  const router = useRouter()
  const locale = useLocale()
  const { user, isAuthenticated } = useAuth()
  const {
    cart,
    providerGroups,
    totalItems,
    totalPrice,
    source,
    cityConflict,
    isLoading,
    isSyncing,
    removeItem,
    updateQuantity,
    refreshCart,
  } = useCart()
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [addressReference, setAddressReference] = useState("")
  const [discoveryRadiusKm, setDiscoveryRadiusKm] = useState("6")
  const [checkingOut, setCheckingOut] = useState(false)

  const isGuestCart = source === "guest"
  const canCheckout = isAuthenticated && source === "server" && totalItems > 0
  const itemsMessage =
    totalItems === 0
      ? "No hay piezas en la cesta."
      : `Tienes ${totalItems} artículo${totalItems > 1 ? "s" : ""} listo${totalItems > 1 ? "s" : ""} para comprar.`

  const groupedSummary = useMemo(
    () =>
      providerGroups.map((provider) => ({
        id: provider.id,
        providerName: provider.providerName,
        subtotalAmount: provider.subtotalAmount,
        originalSubtotalAmount: provider.originalSubtotalAmount,
        discountAmount: provider.discountAmount,
        itemCount: provider.itemCount,
      })),
    [providerGroups],
  )

  const redirectToLogin = () => {
    toast.info(
      "Tu mini-cesta se conservará y la pasaremos al carrito oficial cuando inicies sesión.",
    )
    router.push("/login?returnTo=%2Fcart")
  }

  const startOfficialCheckout = async () => {
    if (!isAuthenticated || !user) {
      redirectToLogin()
      return
    }

    if (!user.roles.includes("CLIENT")) {
      toast.error("El checkout oficial está disponible para cuentas cliente.")
      return
    }

    if (!cart.cityId) {
      toast.error("El carrito oficial todavía no tiene ciudad operativa.")
      return
    }

    if (!deliveryAddress.trim()) {
      toast.error("La dirección de entrega es obligatoria.")
      return
    }

    if (!postalCode.trim()) {
      toast.error("El código postal es obligatorio.")
      return
    }

    const parsedRadius = Number(discoveryRadiusKm)
    if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
      toast.error("Indica un radio de compra válido en kilómetros.")
      return
    }

    setCheckingOut(true)
    try {
      const createdOrder = await cartService.checkout(
        {
          cityId: cart.cityId,
          deliveryAddress: deliveryAddress.trim(),
          postalCode: postalCode.trim().toUpperCase(),
          addressReference: addressReference.trim() || undefined,
          discoveryRadiusKm: parsedRadius,
        },
        buildIdempotencyKey(),
      )

      await refreshCart()
      toast.success(
        "Pedido oficial creado. Ahora debes revisar los pagos separados por comercio.",
      )
      window.location.assign(`/${locale}/orders/${createdOrder.id}/payments`)
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(
          error,
          "No pudimos crear el pedido oficial desde el carrito.",
        ),
      )
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background/50">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="font-display text-4xl font-extrabold text-foreground">
              Tu cesta
            </h1>
            <p className="text-lg font-medium text-muted-foreground">
              {itemsMessage}
            </p>
          </div>

          {cityConflict ? (
            <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {cityConflict}
            </div>
          ) : null}

          {isLoading ? (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Cargando el estado actual de la cesta...
            </div>
          ) : null}

          {isSyncing ? (
            <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
              Estamos sincronizando tu mini-cesta con el carrito oficial.
            </div>
          ) : null}

          {isGuestCart ? (
            <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Mini-cesta temporal
              </div>
              <p className="mt-2">
                Puedes seguir explorando el catálogo sin sesión. Cuando entres a comprar de verdad, esta cesta se migrará al carrito backend oficial.
              </p>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm text-primary">
              <div className="flex items-center gap-2 font-semibold">
                <PackageCheck className="h-4 w-4" />
                Carrito backend oficial
              </div>
              <p className="mt-2">
                Esta vista ya representa el carrito agrupado por proveedor que usa el checkout oficial multiproveedor.
              </p>
            </div>
          )}

          {totalItems === 0 ? (
            <div className="mt-16 flex flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-border bg-card/50 p-12">
              <Inbox className="h-20 w-20 text-muted-foreground/30" />
              <div className="text-center">
                <h3 className="text-xl font-bold">La cesta está vacía</h3>
                <p className="mt-2 max-w-md text-muted-foreground">
                  Añade productos del catálogo para preparar un pedido real por proveedor.
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="mt-4 border-2 border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => router.push("/products")}
              >
                Explorar el mercado
              </Button>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
              <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
                {providerGroups.map((provider) => (
                  <section
                    key={provider.id}
                    className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-foreground">
                          {provider.providerName}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {provider.itemCount} artículo{provider.itemCount > 1 ? "s" : ""} de este proveedor
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Subtotal proveedor
                        </p>
                        {provider.discountAmount > 0 ? (
                          <p className="text-sm text-muted-foreground line-through">
                            {provider.originalSubtotalAmount.toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </p>
                        ) : null}
                        <p className="text-xl font-extrabold text-foreground">
                          {provider.subtotalAmount.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </p>
                        {provider.discountAmount > 0 ? (
                          <p className="text-xs font-semibold text-emerald-700">
                            Descuento del proveedor: -
                            {provider.discountAmount.toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      {provider.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-background/60 p-5 sm:flex-row sm:items-center"
                        >
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/30">
                            {item.product.imageUrl ? (
                              <img
                                src={item.product.imageUrl}
                                alt={item.product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <img
                                src="/placeholder.svg"
                                alt="Producto sin imagen"
                                className="h-full w-full object-cover opacity-80"
                              />
                            )}
                          </div>

                          <div className="flex flex-1 flex-col gap-1.5">
                            <h3 className="text-lg font-bold text-foreground">
                              {item.product.name}
                            </h3>
                            <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              {item.product.city}
                            </p>
                            {item.discountAmount > 0 ? (
                              <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-muted-foreground line-through">
                                  {item.baseUnitPrice.toLocaleString("es-ES", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </p>
                                <p className="text-base font-semibold text-primary">
                                  {item.unitPrice.toLocaleString("es-ES", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </p>
                                <p className="text-xs font-semibold text-emerald-700">
                                  Descuento aplicado por {provider.providerName}
                                </p>
                              </div>
                            ) : (
                              <p className="text-base font-semibold text-primary">
                                {item.unitPrice.toLocaleString("es-ES", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                              </p>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/50 pt-4 sm:mt-0 sm:border-t-0 sm:pt-0">
                            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background px-1 py-1 shadow-sm">
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() =>
                                  void updateQuantity(item.id, item.quantity - 1)
                                }
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-foreground">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() =>
                                  void updateQuantity(item.id, item.quantity + 1)
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="min-w-[5rem] text-right text-lg font-extrabold text-foreground">
                                {item.subtotal.toLocaleString("es-ES", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                              </span>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"
                                onClick={() => void removeItem(item.id)}
                                title="Eliminar producto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <aside className="lg:col-span-5 xl:col-span-4">
                <div className="sticky top-24 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    Resumen de compra
                  </h2>

                  <div className="mt-6 space-y-3 border-b border-dashed border-border/80 pb-6 font-mono text-sm text-foreground/80">
                    {groupedSummary.map((provider) => (
                      <div
                        key={provider.id}
                        className="flex items-start justify-between gap-4"
                      >
                        <span className="flex-1 leading-snug">
                          {provider.providerName}
                          <span className="block text-xs text-muted-foreground">
                            {provider.itemCount} línea{provider.itemCount > 1 ? "s" : ""}
                          </span>
                        </span>
                        <span className="font-semibold text-foreground">
                          {provider.discountAmount > 0 ? (
                            <span className="mr-2 text-xs text-muted-foreground line-through">
                              {provider.originalSubtotalAmount.toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </span>
                          ) : null}
                          {provider.subtotalAmount.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col gap-4 font-mono">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Total piezas</span>
                      <span className="font-medium text-foreground">
                        {cart.discountAmount && cart.discountAmount > 0 ? (
                          <span className="mr-2 text-xs text-muted-foreground line-through">
                            {(cart.originalTotalPrice ?? totalPrice).toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </span>
                        ) : null}
                        {totalPrice.toLocaleString("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </span>
                    </div>
                    {cart.discountAmount && cart.discountAmount > 0 ? (
                      <div className="flex justify-between text-emerald-700">
                        <span>Ahorro aplicado</span>
                        <span className="font-semibold">
                          -
                          {cart.discountAmount.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Ciudad operativa</span>
                      <span className="font-medium text-foreground">
                        {cart.cityName || "Pendiente"}
                      </span>
                    </div>
                  </div>

                  {isGuestCart ? (
                    <div className="mt-8 rounded-2xl border border-border bg-background/70 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <UserRoundCheck className="h-4 w-4 text-primary" />
                        Activa el carrito oficial
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Inicia sesión para migrar esta mini-cesta al carrito backend y continuar con el checkout real.
                      </p>
                      <div className="mt-4 flex flex-col gap-3">
                        <Button onClick={redirectToLogin} className="gap-2">
                          Iniciar sesión y continuar
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            router.push("/register?returnTo=%2Fcart")
                          }
                        >
                          Crear cuenta cliente
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 flex flex-col gap-4">
                      <div className="rounded-2xl border border-border bg-background/70 p-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                          <Truck className="h-4 w-4 text-primary" />
                          Entrega oficial
                        </h3>

                        <div className="mt-4 grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="deliveryAddress">
                              Dirección de entrega
                            </Label>
                            <Input
                              id="deliveryAddress"
                              value={deliveryAddress}
                              onChange={(event) =>
                                setDeliveryAddress(event.target.value)
                              }
                              placeholder="Calle, número y puerta"
                              disabled={checkingOut || isLoading}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="postalCode">Código postal</Label>
                            <Input
                              id="postalCode"
                              value={postalCode}
                              onChange={(event) =>
                                setPostalCode(event.target.value)
                              }
                              placeholder="28013"
                              disabled={checkingOut || isLoading}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="addressReference">
                              Referencia adicional
                            </Label>
                            <Input
                              id="addressReference"
                              value={addressReference}
                              onChange={(event) =>
                                setAddressReference(event.target.value)
                              }
                              placeholder="Portal, escalera o punto de encuentro"
                              disabled={checkingOut || isLoading}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="discoveryRadiusKm">
                              Radio de compra
                            </Label>
                            <Input
                              id="discoveryRadiusKm"
                              type="number"
                              min="0.5"
                              max="100"
                              step="0.5"
                              value={discoveryRadiusKm}
                              onChange={(event) =>
                                setDiscoveryRadiusKm(event.target.value)
                              }
                              disabled={checkingOut || isLoading}
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        className="h-14 gap-2 text-base font-bold"
                        size="lg"
                        onClick={startOfficialCheckout}
                        disabled={!canCheckout || checkingOut || isLoading}
                      >
                        {checkingOut ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Creando pedido oficial...
                          </>
                        ) : (
                          <>
                            Crear pedido oficial
                            <ArrowRight className="h-5 w-5" />
                          </>
                        )}
                      </Button>

                      <p className="text-center text-xs leading-relaxed text-muted-foreground">
                        Este paso ya usa el checkout multiproveedor oficial en backend. El pago por proveedor se conecta después.
                      </p>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
