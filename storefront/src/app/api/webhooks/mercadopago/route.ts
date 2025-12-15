import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { sdk } from '@lib/config'; // <--- OJO: Asegúrate que esta importación sea correcta en tu proyecto

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  console.log("🔔 [WEBHOOK-MP] >>> Nueva llamada al webhook <<<")
  
  // 1. Extraer Query Params (A veces el ID viene en la URL: ?id=123&topic=payment)
  const searchParams = req.nextUrl.searchParams;
  const queryId = searchParams.get("data.id") || searchParams.get("id");
  const queryTopic = searchParams.get("topic") || searchParams.get("type");

  try {
    // 2. Obtener el body
    const body = await req.json().catch(() => ({}))
    console.log("📦 [WEBHOOK-MP] Body recibido:", JSON.stringify(body))

    // -----------------------------------------------------------------------
    // ESTRATEGIA DE EXTRACCIÓN DE ID MEJORADA
    // -----------------------------------------------------------------------
    let paymentId = body?.data?.id || body?.id || queryId;
    let topic = body?.topic || body?.type || queryTopic || 'unknown';

    // Caso especial: Formato "Resource" (El que te está llegando a vos)
    // Ejemplo: { resource: "123456", topic: "payment" }
    // O Ejemplo: { resource: "https://.../payments/123456", topic: "payment" }
    if (!paymentId && body?.resource) {
       const resource = body.resource; // Puede ser un número o una URL
       if (resource.toString().includes('/')) {
          // Es una URL, sacamos lo último
          const parts = resource.split('/');
          paymentId = parts[parts.length - 1];
       } else {
          // Es el ID directo
          paymentId = resource;
       }
    }

    // -----------------------------------------------------------------------
    // FILTRO DE TÓPICOS
    // -----------------------------------------------------------------------
    // Si es una "merchant_order", por ahora la ignoramos y retornamos 200.
    // Solo queremos procesar cuando el TÓPICO sea 'payment' para crear la orden.
    if (topic === 'merchant_order') {
        console.log("ℹ️ [WEBHOOK-MP] Ignorando merchant_order (esperando notificación de payment). ID:", paymentId);
        return NextResponse.json({ status: "ignored_merchant_order" }, { status: 200 });
    }

    if (!paymentId) {
      console.error("❌ [WEBHOOK-MP] No se encontró payment_id. Body:", JSON.stringify(body));
      return NextResponse.json({ error: "No ID found" }, { status: 200 });
    }

    console.log(`🔍 [WEBHOOK-MP] Procesando Payment ID: ${paymentId} (Topic: ${topic})`)

    // -----------------------------------------------------------------------
    // CONSULTA A MERCADOPAGO
    // -----------------------------------------------------------------------
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error("❌ [WEBHOOK-MP] Falta MERCADOPAGO_ACCESS_TOKEN");
      return NextResponse.json({ error: "Config error" }, { status: 200 });
    }

    const mercadoPagoConfig = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(mercadoPagoConfig)

    // Consultamos el estado REAL
    const payment = await paymentClient.get({ id: paymentId })
    
    if (!payment) {
        console.error("❌ [WEBHOOK-MP] Pago no encontrado en MP");
        return NextResponse.json({ error: "Not found" }, { status: 200 });
    }

    console.log("📋 [WEBHOOK-MP] Estado:", payment.status, "| Detalle:", payment.status_detail)

    // 4. Verificar aprobación
    if (payment.status === "approved" && payment.status_detail === "accredited") {
        
        const cartId = payment.external_reference;
        
        if (!cartId) {
            console.error("❌ [WEBHOOK-MP] El pago no tiene external_reference (cart_id)");
            return NextResponse.json({ error: "No external_reference" }, { status: 200 });
        }

        console.log("🛒 [WEBHOOK-MP] Cart ID encontrado:", cartId);

        // 5. COMPLETAR ORDEN EN MEDUSA
        try {
            // Verificamos si ya existe (Idempotencia básica)
            const existingCart = await sdk.store.cart.retrieve(cartId).catch(() => null);
            
            // FIX: Agregamos 'as any' para que TypeScript no chille por 'completed_at'
            if ((existingCart?.cart as any)?.completed_at) {
              console.log("✅ [WEBHOOK-MP] El carrito ya estaba completado. Nada que hacer.");
              return NextResponse.json({ message: "Already completed" }, { status: 200 });
         }

            console.log("🚀 [WEBHOOK-MP] Completando carrito en Medusa...");
            const completion = await sdk.store.cart.complete(cartId);
            
            if (completion?.type === 'order') {
                console.log("🎉 [WEBHOOK-MP] ¡ORDEN CREADA EXITOSAMENTE! ID:", completion.order.id);
                return NextResponse.json({ status: "success", order_id: completion.order.id }, { status: 200 });
            } else {
                 console.error("⚠️ [WEBHOOK-MP] Respuesta inesperada al completar:", completion);
                 return NextResponse.json({ error: "Completion failed" }, { status: 200 });
            }

        } catch (err: any) {
            // Si el error dice "Cart already completed", es un éxito en realidad (idempotencia)
            if (err.message?.includes('completed') || err.status === 400 || err.status === 409) {
                 console.log("✅ [WEBHOOK-MP] Orden ya existía (Catch).");
                 return NextResponse.json({ message: "Order exists" }, { status: 200 });
            }
            console.error("❌ [WEBHOOK-MP] Error al crear orden en Medusa:", err.message);
            // Retornamos 200 igual para que MP deje de insistir si es un error irrecuperable de lógica nuestra
             return NextResponse.json({ error: err.message }, { status: 200 });
        }
    } else {
        console.log("⚠️ [WEBHOOK-MP] Pago no aprobado aún. Estado:", payment.status);
    }

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error("💥 [WEBHOOK-MP] Error CRÍTICO:", error.message);
    return NextResponse.json({ error: "Internal Error" }, { status: 200 });
  }
}