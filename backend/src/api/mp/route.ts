import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"; 

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
      const payment = await new Payment(client).get({ id });
      
      if (payment.status === "approved") {
        let resourceId = payment.external_reference; // Podría ser cart_... o payses_...
        
        console.log(`✅ [WEBHOOK] Aprobado. Referencia: ${resourceId}`);
        
        // --- FIX INTELIGENTE ---
        // Si recibimos un ID de sesión (payses_), NO podemos usar completeCartWorkflow directamente con él.
        // Pero en tu caso, con el arreglo del provider, ya debería llegar cart_.
        // Si llega cart_, ejecutamos:
        
        if (resourceId && resourceId.startsWith("cart_")) {
            console.log(`🛒 [WEBHOOK] Cerrando carrito: ${resourceId}`);
            try {
                const { result } = await completeCartWorkflow(req.scope).run({
                input: { id: resourceId },
                });
                console.log(`🚀 [WEBHOOK] ORDEN CREADA: ${result.id}`);
            } catch (err: any) {
                console.log(`⚠️ [WEBHOOK] Error al cerrar (quizás ya se cerró): ${err.message}`);
            }
        } else {
            console.warn(`⚠️ [WEBHOOK] Recibí un ID que no es de carrito (${resourceId}). No puedo completar la orden.`);
        }
      }
    } catch (error) {
      console.error("❌ [WEBHOOK] Error:", error);
    }
  }
  res.sendStatus(200);
}