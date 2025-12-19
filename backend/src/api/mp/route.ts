import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"; 

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
});

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    res.json({ status: "ok", message: "Webhook Activo 🚀" });
}

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
                const remoteQuery = req.scope.resolve("remoteQuery");
                
                // Sintaxis ajustada para asegurar que obtenemos el cart_id
                const query = {
                    entryPoint: "payment_session",
                    fields: ["payment_collection.cart_id"],
                    filters: { id: targetId }
                };

                const result = await remoteQuery(query);
                // Validación segura de arrays y objetos
                const fetchedCartId = result[0]?.payment_collection?.cart_id;

                if (fetchedCartId) {
                    console.log(`🎯 [WEBHOOK] ¡Carrito encontrado!: ${fetchedCartId}`);
                    targetId = fetchedCartId; 
                } else {
                    console.warn(`⚠️ [WEBHOOK] No se encontró carrito para ${targetId}`);
                    // Si no encontramos carrito, no podemos seguir.
                    res.sendStatus(200); 
                    return;
                }
            } catch (dbError) {
                console.error(`❌ [WEBHOOK] Error DB: ${dbError}`);
            }
        }

        // --- CREAR ORDEN (CORREGIDO) ---
        if (targetId && targetId.startsWith("cart_")) {
          console.log(`🛒 [WEBHOOK] Cerrando orden para: ${targetId}`);
          try {
            // 🛑 CORRECCIÓN CLAVE AQUÍ ABAJO:
            const { result } = await completeCartWorkflow.run({
              container: req.scope, // El container va DENTRO de las opciones
              input: { id: targetId },
            });
            
            console.log(`🚀 [WEBHOOK] ¡ORDEN CREADA! ID: ${result.id}`);
          } catch (err: any) {
             // Es posible que el Frontend haya ganado la carrera. No es grave.
             console.log(`⚠️ [WEBHOOK] Info workflow: ${err.message}`);
          }
        }
      }
    } catch (error) {
      console.error("❌ [WEBHOOK] Error General:", error);
    }
  }
  res.sendStatus(200);
}