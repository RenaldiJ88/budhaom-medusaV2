import { NextRequest, NextResponse } from "next/server"
import { MercadoPagoConfig, Payment } from "mercadopago"
import { sdk } from "@lib/config"

export async function POST(req: NextRequest) {
  console.log("🔔 [WEBHOOK-MP] >>> Nueva llamada al webhook <<<")

  // 1. Extraer Query Params (A veces el ID viene en la URL: ?id=123&topic=payment)
  const searchParams = req.nextUrl.searchParams
  const queryId = searchParams.get("data.id") || searchParams.get("id")
  const queryTopic = searchParams.get("topic") || searchParams.get("type")

  try {
    // 2. Obtener el body (sin loguear datos sensibles)
    const body = await req.json().catch(() => ({}))
    console.log("📦 [WEBHOOK-MP] Body keys:", Object.keys(body || {}))

    // -----------------------------------------------------------------------
    // ESTRATEGIA DE EXTRACCIÓN DE ID MEJORADA
    // -----------------------------------------------------------------------
    let paymentId = body?.data?.id || body?.id || queryId
    let topic = body?.topic || body?.type || queryTopic || "unknown"

    // Caso especial: Formato "Resource"
    // Ejemplo: { resource: "123456", topic: "payment" }
    // O Ejemplo: { resource: "https://.../payments/123456", topic: "payment" }
    if (!paymentId && body?.resource) {
      const resource = body.resource // Puede ser un número o una URL
      if (resource.toString().includes("/")) {
        // Es una URL, sacamos lo último
        const parts = resource.split("/")
        paymentId = parts[parts.length - 1]
      } else {
        // Es el ID directo
        paymentId = resource
      }
    }

    // -----------------------------------------------------------------------
    // FILTRO DE TÓPICOS
    // -----------------------------------------------------------------------
    // Si es una "merchant_order", por ahora la ignoramos y retornamos 200.
    // Solo queremos procesar cuando el TÓPICO sea 'payment' para crear la orden.
    if (topic === "merchant_order") {
      console.log(
        "ℹ️ [WEBHOOK-MP] Ignorando merchant_order (esperando notificación de payment). ID:",
        paymentId
      )
      return NextResponse.json(
        { status: "ignored_merchant_order" },
        { status: 200 }
      )
    }

    if (!paymentId) {
      console.error(
        "❌ [WEBHOOK-MP] No se encontró payment_id. Body keys:",
        Object.keys(body || {})
      )
      return NextResponse.json({ error: "No ID found" }, { status: 200 })
    }

    console.log(
      `🔍 [WEBHOOK-MP] Procesando Payment ID: ${paymentId} (Topic: ${topic})`
    )

    // -----------------------------------------------------------------------
    // CONSULTA A MERCADOPAGO
    // -----------------------------------------------------------------------
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error("❌ [WEBHOOK-MP] Falta MERCADOPAGO_ACCESS_TOKEN")
      return NextResponse.json({ error: "Config error" }, { status: 200 })
    }

    const mercadoPagoConfig = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(mercadoPagoConfig)

    // Consultamos el estado REAL
    const payment = await paymentClient.get({ id: paymentId })

    if (!payment) {
      console.error("❌ [WEBHOOK-MP] Pago no encontrado en MP")
      return NextResponse.json({ error: "Not found" }, { status: 200 })
    }

    console.log("📋 [WEBHOOK-MP] Estado:", payment.status, "| Detalle:", payment.status_detail)

    // 4. Verificar aprobación
    if (payment.status === "approved" && payment.status_detail === "accredited") {
      const cartId = payment.external_reference

      if (!cartId) {
        console.error(
          "❌ [WEBHOOK-MP] El pago no tiene external_reference (cart_id)"
        )
        return NextResponse.json(
          { error: "No external_reference" },
          { status: 200 }
        )
      }

      console.log("🛒 [WEBHOOK-MP] Cart ID encontrado:", cartId)

      // 5. COMPLETAR ORDEN EN MEDUSA (IDEMPOTENTE Y SEGURO ANTE CONCURRENCIA)
      try {
        // ============================================================
        // PASO 1: Verificación temprana de idempotencia
        // ============================================================
        let existingCart: any = null
        try {
          const existingCartRes = await sdk.store.cart.retrieve(cartId)
          existingCart = existingCartRes?.cart as
            | (typeof existingCartRes.cart & {
                completed_at?: string | Date | null
                shipping_methods?: Array<{ id: string }>
              })
            | undefined

          // Si el carrito ya está completado, retornar inmediatamente
          if (existingCart?.completed_at) {
            console.log(
              "✅ [WEBHOOK-MP] Carrito ya completado (verificación temprana). Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Already completed", cart_id: cartId },
              { status: 200 }
            )
          }
        } catch (retrieveError: any) {
          // Si el cart no existe (404), puede ser que ya se convirtió en order
          // O puede ser un error de red. Continuamos con precaución.
          if (retrieveError.status === 404 || retrieveError.statusCode === 404) {
            console.log(
              "⚠️ [WEBHOOK-MP] Cart no encontrado (404). Puede estar ya convertido en order. Continuando..."
            )
          } else {
            console.warn(
              "⚠️ [WEBHOOK-MP] Error al recuperar cart (no crítico):",
              retrieveError.message
            )
          }
        }

        // ============================================================
        // PASO 2: Asegurar contexto de país + agregar shipping method
        // ============================================================
        // 2.1. Si no hay country_code en la dirección de envío, forzamos una por defecto (AR)
        if (!existingCart?.shipping_address?.country_code) {
          console.log(
            "🌎 [WEBHOOK-MP] Cart sin country_code en shipping_address. Forzando contexto por defecto (AR)..."
          )

          try {
            await sdk.store.cart.update(cartId, {
              shipping_address: {
                // País por defecto para calcular región / opciones de envío
                country_code: "ar",
                // Datos dummy mínimos para que Medusa acepte la dirección
                first_name:
                  (existingCart as any)?.shipping_address?.first_name || "Guest",
                last_name:
                  (existingCart as any)?.shipping_address?.last_name || "Guest",
              },
            })

            console.log(
              "✅ [WEBHOOK-MP] shipping_address actualizado con country_code por defecto (AR)"
            )
          } catch (updateAddressError: any) {
            const errorStatus =
              updateAddressError.status ||
              updateAddressError.statusCode ||
              updateAddressError.response?.status

            console.warn(
              "⚠️ [WEBHOOK-MP] No se pudo actualizar shipping_address (se continuará igualmente):",
              {
                message: updateAddressError.message,
                status: errorStatus,
              }
            )
          }
        }

        // 2.2. Agregar shipping method (DEFENSIVO - no falla si el cart ya no existe)
        const hasShippingMethods =
          existingCart &&
          Array.isArray(existingCart.shipping_methods) &&
          existingCart.shipping_methods.length > 0

        if (!hasShippingMethods) {
          console.log(
            "🚚 [WEBHOOK-MP] Carrito sin shipping_methods. Intentando agregar uno por defecto..."
          )
          
          try {
            const optionsRes =
              await sdk.store.fulfillment.listCartOptions({ cart_id: cartId })

            const shippingOptions =
              (optionsRes as any)?.shipping_options ||
              (optionsRes as any)?.fulfillment_options ||
              (optionsRes as any)?.options ||
              []

            if (Array.isArray(shippingOptions) && shippingOptions.length > 0) {
              const defaultOption = shippingOptions[0]
              console.log(
                "📦 [WEBHOOK-MP] Agregando shipping_method por defecto:",
                defaultOption.id
              )

              try {
                await sdk.store.cart.addShippingMethod(cartId, {
                  option_id: defaultOption.id,
                })
                console.log(
                  "✅ [WEBHOOK-MP] Shipping_method agregado correctamente"
                )
              } catch (addShippingError: any) {
                // DEFENSIVO: Si falla con 404 o 422, el cart probablemente ya fue completado por otro webhook
                const errorStatus =
                  addShippingError.status ||
                  addShippingError.statusCode ||
                  addShippingError.response?.status

                if (errorStatus === 404 || errorStatus === 422) {
                  console.log(
                    "ℹ️ [WEBHOOK-MP] No se pudo agregar shipping_method (404/422). Cart probablemente ya completado por otro webhook. Continuando..."
                  )
                  // NO lanzamos el error, simplemente continuamos
                } else {
                  // Otro tipo de error, lo logueamos pero continuamos
                  console.warn(
                    "⚠️ [WEBHOOK-MP] Error al agregar shipping_method (no crítico):",
                    {
                      message: addShippingError.message,
                      status: errorStatus,
                    }
                  )
                }
              }
            } else {
              console.warn(
                "⚠️ [WEBHOOK-MP] No hay opciones de envío disponibles para el carrito",
                { cartId }
              )
            }
          } catch (listOptionsError: any) {
            // Si falla listar opciones, puede ser que el cart ya no exista
            const errorStatus =
              listOptionsError.status ||
              listOptionsError.statusCode ||
              listOptionsError.response?.status

            if (errorStatus === 404) {
              console.log(
                "ℹ️ [WEBHOOK-MP] No se pudieron listar opciones de envío (404). Cart puede estar ya completado. Continuando..."
              )
            } else {
              console.warn(
                "⚠️ [WEBHOOK-MP] Error al listar opciones de envío (no crítico):",
                listOptionsError.message
              )
            }
          }
        }

        // ============================================================
        // PASO 3: Completar carrito (DEFENSIVO - maneja race conditions)
        // ============================================================
        console.log("🚀 [WEBHOOK-MP] Intentando completar carrito en Medusa...")
        
        try {
          const completion = await sdk.store.cart.complete(cartId)

          if (completion?.type === "order" && completion?.order) {
            console.log(
              "🎉 [WEBHOOK-MP] ¡ORDEN CREADA EXITOSAMENTE! ID:",
              completion.order.id
            )
            return NextResponse.json(
              { status: "success", order_id: completion.order.id, cart_id: cartId },
              { status: 200 }
            )
          } else {
            console.warn(
              "⚠️ [WEBHOOK-MP] Respuesta inesperada al completar:",
              completion?.type
            )
            return NextResponse.json(
              { status: "unexpected_response", cart_id: cartId },
              { status: 200 }
            )
          }
        } catch (completeError: any) {
          // ============================================================
          // MANEJO ROBUSTO DE ERRORES DE CONCURRENCIA
          // ============================================================
          const errorMessage = completeError.message || ""
          const errorStatus =
            completeError.status ||
            completeError.statusCode ||
            completeError.response?.status

          // Caso 1: Transaction already started (otro webhook está procesando)
          if (
            errorMessage.toLowerCase().includes("transaction already started") ||
            errorMessage.toLowerCase().includes("transaction in progress")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Transaction ya iniciada por otro webhook. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Transaction already started", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 2: Cart not found (404) - ya fue convertido a order
          if (errorStatus === 404) {
            console.log(
              "✅ [WEBHOOK-MP] Cart no encontrado (404). Ya convertido a order por otro webhook. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Cart already converted to order", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 3: Conflict (409) o idempotency_key
          if (
            errorStatus === 409 ||
            errorMessage.toLowerCase().includes("idempotency") ||
            errorMessage.toLowerCase().includes("already exists") ||
            errorMessage.toLowerCase().includes("duplicate")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Conflicto de idempotencia detectado. Orden ya procesada."
            )
            return NextResponse.json(
              { message: "Order already processed (idempotency)", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 4: Cart already completed
          if (
            errorMessage.toLowerCase().includes("completed") ||
            errorMessage.toLowerCase().includes("already completed")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Cart ya completado. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Cart already completed", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 5: Errores 400 genéricos (pueden ser validaciones que indican que ya está procesado)
          if (errorStatus === 400) {
            console.log(
              "⚠️ [WEBHOOK-MP] Error 400 al completar. Asumiendo idempotencia por seguridad."
            )
            return NextResponse.json(
              { message: "Bad request (likely already processed)", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 6: ERROR GENUINO DESCONOCIDO - Solo estos deberían llegar aquí
          console.error("❌ [WEBHOOK-MP] Error genuino al completar carrito:", {
            message: errorMessage,
            status: errorStatus,
            stack: completeError.stack,
            cart_id: cartId,
          })
          
          // Para errores genuinos desconocidos, retornamos 200 igual para evitar loops de reintentos
          // pero logueamos el error para debugging
          return NextResponse.json(
            {
              error: "Unknown error during completion",
              cart_id: cartId,
              error_type: "genuine_error",
            },
            { status: 200 }
          )
        }
      } catch (outerError: any) {
        // Catch-all para errores inesperados en el bloque try principal
        console.error("💥 [WEBHOOK-MP] Error inesperado en bloque principal:", {
          message: outerError.message,
          stack: outerError.stack,
          cart_id: cartId,
        })
        // Siempre retornar 200 para evitar loops de reintentos de MercadoPago
        return NextResponse.json(
          { error: "Unexpected error", cart_id: cartId },
          { status: 200 }
        )
      }
    } else {
      console.log(
        "⚠️ [WEBHOOK-MP] Pago no aprobado aún. Estado:",
        payment.status
      )
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error("💥 [WEBHOOK-MP] Error CRÍTICO:", {
      message: error.message,
      stack: error.stack,
    })
    return NextResponse.json({ error: "Internal Error" }, { status: 200 })
  }
}