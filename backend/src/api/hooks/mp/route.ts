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

  // 1. Filtro de seguridad: Solo procesamos pagos con ID
  if (topic !== "payment" || !id) {
    res.sendStatus(200);
    return;
  }

  console.log(`🔔 [WEBHOOK] Procesando Pago MP ID: ${id}`);

  try {
    const payment = await new Payment(client).get({ id });
    
    if (payment.status === "approved") {
      let targetId = payment.external_reference;
      
      // --- TRADUCCIÓN SEGURA (SINTAXIS V2) ---
      if (targetId && targetId.startsWith("payses_")) {
          console.log(`🕵️‍♂️ [WEBHOOK] Buscando Cart para Session: ${targetId}`);
          
          try {
              const remoteQuery = req.scope.resolve("remoteQuery");
              
              // ESTRATEGIA: Navegar el grafo paso a paso
              // Session -> Payment Collection -> Cart -> ID
              const query = {
                  entryPoint: "payment_session",
                  fields: ["payment_collection.cart.id"], // <--- LA CLAVE ES ESTA RUTA
                  filters: { id: targetId }
              };

              const result = await remoteQuery(query);
              const sessionData = Array.isArray(result) ? result[0] : result;
              
              // Extracción segura (Optional Chaining)
              const fetchedCartId = sessionData?.payment_collection?.cart?.id;

              if (fetchedCartId) {
                  console.log(`🎯 [WEBHOOK] ¡CART ID ENCONTRADO!: ${fetchedCartId}`);
                  targetId = fetchedCartId; 
              } else {
                  // Fallback de depuración: Si falla, vemos qué parte de la cadena se rompió
                  console.warn(`⚠️ [WEBHOOK] Cadena rota. Datos parciales:`, JSON.stringify(sessionData));
              }
          } catch (dbError) {
              console.error(`❌ [WEBHOOK] Error RemoteQuery:`, dbError);
          }
      }

      // --- COMPLETAR ORDEN ---
      if (targetId && targetId.startsWith("cart_")) {
        console.log(`🛒 [WEBHOOK] Cerrando orden para Cart: ${targetId}`);
        try {
          // completeCartWorkflow es la forma correcta en V2
          const { result } = await completeCartWorkflow.run({
            container: req.scope,
            input: { id: targetId },
          });
          console.log(`🚀 [WEBHOOK] ¡ORDEN CREADA! ID: ${result.id}`);
        } catch (err: any) {
           const msg = err.message || "";
           // Manejo de idempotencia (si MP notifica 2 veces, no fallamos la segunda)
           if (msg.includes("completed") || msg.includes("409")) {
               console.log(`✅ [WEBHOOK] Orden ya estaba completa (Idempotencia).`);
           } else {
               console.error(`⚠️ [WEBHOOK] Fallo Workflow: ${msg}`);
           }
        }
      }
    }
  } catch (error) {
    console.error("❌ [WEBHOOK] Error Crítico:", error);
  }
  
  res.sendStatus(200);
}