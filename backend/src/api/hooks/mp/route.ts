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
  // 1. Normalización de datos de entrada
  const topic = body.topic || body.type;
  const id = body.data?.id || body.data?.ID;

  // 2. FILTRO DE RUIDO: Si no es payment o no tiene ID, ignoramos (200 OK y chau)
  if (topic !== "payment" || !id) {
    // Solo logueamos si es algo raro, para no ensuciar la consola con merchant_orders vacías
    if (topic === "payment") console.log(`⚠️ [WEBHOOK] Payment sin ID recibido.`);
    res.sendStatus(200);
    return;
  }

  console.log(`🔔 [WEBHOOK] Procesando Pago ID: ${id}`);

  try {
    const payment = await new Payment(client).get({ id });
    
    if (payment.status === "approved") {
      let targetId = payment.external_reference;
      console.log(`✅ [WEBHOOK] Status Approved. External Ref: ${targetId}`);
      
      // --- CASO 1: Referencia es PAYMENT SESSION (payses_) ---
      if (targetId && targetId.startsWith("payses_")) {
          console.log(`🕵️‍♂️ [WEBHOOK] Buscando relación para Session: ${targetId}`);
          
          try {
              const remoteQuery = req.scope.resolve("remoteQuery");
              
              // 3. CONSULTA AMPLIADA PARA DEBUG
              // Pedimos TODO (*) para ver qué demonios está devolviendo
              const query = {
                  entryPoint: "payment_session",
                  fields: ["*", "payment_collection.*"], 
                  filters: { id: targetId }
              };

              const result = await remoteQuery(query);
              
              // 🔍 LOG DE DETECTIVE: Imprimimos la estructura exacta
              console.log("🔍 [DEBUG-DB] Resultado Raw:", JSON.stringify(result, null, 2));

              // Intento de extracción robusto
              const sessionData = Array.isArray(result) ? result[0] : result;
              const fetchedCartId = sessionData?.payment_collection?.cart_id; // <--- Aquí suele estar

              if (fetchedCartId) {
                  console.log(`🎯 [WEBHOOK] ¡CART ID RECUPERADO!: ${fetchedCartId}`);
                  targetId = fetchedCartId; 
              } else {
                  console.warn(`⚠️ [WEBHOOK] Session encontrada pero sin cart_id vinculado. Revisa el log [DEBUG-DB].`);
              }
          } catch (dbError) {
              console.error(`❌ [WEBHOOK] Error Consultando DB:`, dbError);
          }
      }

      // --- CASO 2: Referencia ya es CART (cart_) o lo convertimos arriba ---
      if (targetId && targetId.startsWith("cart_")) {
        console.log(`🛒 [WEBHOOK] Intentando completar Cart: ${targetId}`);
        try {
          const { result } = await completeCartWorkflow.run({
            container: req.scope,
            input: { id: targetId },
          });
          console.log(`🚀 [WEBHOOK] ¡ORDEN CREADA EXITOSAMENTE! ID: ${result.id}`);
        } catch (err: any) {
           const msg = err.message || "";
           if (msg.includes("completed")) {
               console.log(`Callate, ya está completada. Todo OK.`);
           } else {
               console.log(`⚠️ [WEBHOOK] Workflow Info: ${msg}`);
           }
        }
      } else {
          // Si llegamos aquí y targetId sigue siendo payses_, falló la conversión
          if (targetId && targetId.startsWith("payses_")) {
            console.error(`❌ [CRITICAL] No se pudo convertir Session -> Cart. El pago quedó huérfano en Medusa.`);
          }
      }
    }
  } catch (error) {
    console.error("❌ [WEBHOOK] Error Fatal en lógica de MP:", error);
  }
  
  res.sendStatus(200);
}