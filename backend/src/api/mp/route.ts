import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"; 
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
});

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any;
  const topic = body.topic || body.type;
  const id = body.data?.id || body.data?.ID;

  console.log(`🔔 [WEBHOOK] Recibido: ${topic} ID: ${id}`);

  if (topic === "payment") {
    try {
      // 1. Consultar estado en Mercado Pago
      const payment = await new Payment(client).get({ id });
      
      if (payment.status === "approved") {
        console.log(`✅ [WEBHOOK] Pago Aprobado. Ref: ${payment.external_reference}`);
        
        let cartId = payment.external_reference;

        // 2. LÓGICA DE RESOLUCIÓN: Si es una sesión (payses_), buscamos el cart_id
        if (cartId && cartId.startsWith("payses_")) {
            console.log(`🕵️‍♂️ [WEBHOOK] ID de sesión detectado (${cartId}). Buscando carrito en DB...`);
            try {
                // AQUÍ SÍ FUNCIONA EL RESOLVE PORQUE 'req.scope' ES UN CONTENEDOR COMPLETO
                const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
                
                const query = {
                    entryPoint: "payment_session",
                    fields: ["payment_collection.cart_id"],
                    filters: { id: cartId }
                };

                const result = await remoteQuery(query);
                const fetchedCartId = result[0]?.payment_collection?.cart_id;

                if (fetchedCartId) {
                    console.log(`🎯 [WEBHOOK] ¡Carrito encontrado!: ${fetchedCartId}`);
                    cartId = fetchedCartId; // Reemplazamos payses_ por cart_
                } else {
                    console.warn(`⚠️ [WEBHOOK] No se encontró carrito para la sesión ${cartId}`);
                }
            } catch (dbError) {
                console.error(`❌ [WEBHOOK] Error DB: ${dbError}`);
            }
        }

        // 3. COMPLETAR LA ORDEN
        if (cartId && cartId.startsWith("cart_")) {
          console.log(`🛒 [WEBHOOK] Cerrando orden para carrito: ${cartId}`);
          try {
            const { result } = await completeCartWorkflow(req.scope).run({
              input: { id: cartId },
            });
            console.log(`🚀 [WEBHOOK] ORDEN CREADA EXITOSAMENTE: ${result.id}`);
          } catch (err: any) {
             console.log(`⚠️ [WEBHOOK] Aviso al cerrar: ${err.message}`);
          }
        } else {
            console.error(`❌ [WEBHOOK] No tenemos un Cart ID válido. No se puede crear la orden.`);
        }
      }
    } catch (error) {
      console.error("❌ [WEBHOOK] Error procesando pago:", error);
    }
  }

  res.sendStatus(200);
}