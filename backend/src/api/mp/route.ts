import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"; 

// Inicializamos MP con tu token
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
});

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // 1. Leemos lo que manda Mercado Pago
  const body = req.body as any;
  const topic = body.topic || body.type;
  const id = body.data?.id || body.data?.ID;

  console.log(`🔔 [WEBHOOK] Recibido: ${topic} ID: ${id}`);

  // Solo nos importa cuando es un pago
  if (topic === "payment") {
    try {
      // 2. Preguntamos a MP: "¿Es verdad que esto se pagó?"
      const payment = await new Payment(client).get({ id });
      
      if (payment.status === "approved") {
        console.log(`✅ [WEBHOOK] Pago Aprobado Oficialmente: ${payment.id}`);
        
        // 3. Buscamos el ID del carrito que guardamos en "external_reference"
        const cartId = payment.external_reference;

        if (cartId) {
          console.log(`🛒 [WEBHOOK] Intentando cerrar carrito: ${cartId}`);
          
          // 4. EL PASO QUE FALTABA: Ejecutar el Workflow de Medusa para crear la orden
          try {
            const { result } = await completeCartWorkflow(req.scope).run({
              input: { id: cartId },
            });
            console.log(`🚀 [WEBHOOK] ORDEN CREADA: ${result.id}`);
          } catch (err: any) {
             console.log(`⚠️ [WEBHOOK] Aviso: ${err.message} (Probablemente ya se creó por el front)`);
          }
        }
      }
    } catch (error) {
      console.error("❌ [WEBHOOK] Error:", error);
    }
  }

  // Siempre decimos "OK" a Mercado Pago para que deje de insistir
  res.sendStatus(200);
}