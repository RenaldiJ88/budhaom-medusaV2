import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"; 

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
});

// GET para verificar estado
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    res.json({ status: "ok", message: "Webhook Activo 🚀" });
}

// POST para recibir notificaciones
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any;
  const topic = body.topic || body.type;
  const id = body.data?.id || body.data?.ID;

  console.log(`🔔 [WEBHOOK] Recibido: ${topic} ID: ${id}`);

  if (topic === "payment") {
    try {
      const payment = await new Payment(client).get({ id });
      
      if (payment.status === "approved") {
        let targetId = payment.external_reference;
        console.log(`✅ [WEBHOOK] Aprobado. Ref: ${targetId}`);
        
        // --- TRADUCCIÓN PAYSES -> CART ---
        if (targetId && targetId.startsWith("payses_")) {
            console.log(`🕵️‍♂️ [WEBHOOK] Es una sesión. Buscando carrito en DB...`);
            try {
                // Aquí usamos el string "remoteQuery", es más seguro
                const remoteQuery = req.scope.resolve("remoteQuery");
                
                const query = {
                    entryPoint: "payment_session",
                    fields: ["payment_collection.cart_id"],
                    filters: { id: targetId }
                };

                const result = await remoteQuery(query);
                const fetchedCartId = result[0]?.payment_collection?.cart_id;

                if (fetchedCartId) {
                    console.log(`🎯 [WEBHOOK] ¡Carrito encontrado!: ${fetchedCartId}`);
                    targetId = fetchedCartId; 
                } else {
                    console.warn(`⚠️ [WEBHOOK] No se encontró carrito para ${targetId}`);
                }
            } catch (dbError) {
                console.error(`❌ [WEBHOOK] Error DB: ${dbError}`);
            }
        }

        // --- CREAR ORDEN ---
        if (targetId && targetId.startsWith("cart_")) {
          console.log(`🛒 [WEBHOOK] Cerrando orden para: ${targetId}`);
          try {
            const { result } = await completeCartWorkflow(req.scope).run({
              input: { id: targetId },
            });
            console.log(`🚀 [WEBHOOK] ¡ORDEN CREADA! ID: ${result.id}`);
          } catch (err: any) {
             console.log(`⚠️ [WEBHOOK] Error workflow: ${err.message}`);
          }
        } else {
            console.error(`❌ [WEBHOOK] ID inválido para cerrar orden: ${targetId}`);
        }
      }
    } catch (error) {
      console.error("❌ [WEBHOOK] Error:", error);
    }
  }
  res.sendStatus(200);
}