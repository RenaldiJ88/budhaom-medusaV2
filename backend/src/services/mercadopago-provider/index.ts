import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions
} from "@medusajs/framework/utils";
import { 
  Logger, 
  WebhookActionResult 
} from "@medusajs/framework/types";
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from 'mercadopago';

type Options = {
  access_token: string;
  public_key?: string;
  store_url?: string;
};

type SessionData = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago";
  
  protected options_: Options;
  protected logger_: Logger;
  protected mercadoPagoConfig: MercadoPagoConfig;
  
  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
      options: { timeout: 10000 }
    });
    console.log("📢 [MP-CONSTRUCTOR] Provider listo (Corrección HTTPS aplicada).");
  }

  // -------------------------------------------------------------------
  // 1. INICIAR PAGO
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log(`🔥 [MP-INIT] Iniciando...`);

    try {
        // --- 1. PREPARACIÓN DE DATOS ---
        let rawId = input.data?.session_id || input.id || input.resource_id;
        const resource_id = rawId ? String(rawId) : `fallback_${Date.now()}`;
        
        // CORRECCIÓN STORE URL
        let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
        if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
        if (!rawStoreUrl.startsWith("http")) rawStoreUrl = `https://${rawStoreUrl}`; // Forzar HTTPS
        const baseUrlStr = `${rawStoreUrl}/checkout`;
        
        // 🔥 CORRECCIÓN CRÍTICA: BACKEND URL (RAILWAY)
        // Railway devuelve el dominio sin protocolo. MP necesita https:// obligatoriamente.
        let backendUrl = (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
        if (!backendUrl.startsWith("http")) {
            backendUrl = `https://${backendUrl}`;
        }
        
        const webhookUrl = `${backendUrl}/hooks/mp`;

        let rawAmount = input.amount || input.context?.amount;
        if (!rawAmount) rawAmount = 100;
        
        // Sanitizar Monto
        const finalAmount = parseFloat(Number(rawAmount).toFixed(2));
        const email = input.email || input.context?.email || "guest@budhaom.com";

        console.log(`🔍 [MP-DEBUG] URLs finales -> Webhook: ${webhookUrl} | Back: ${baseUrlStr}`);

        // Construcción del objeto
        const preferenceData = {
          body: {
            items: [{
                id: resource_id,
                title: "Compra en BUDHA.Om",
                quantity: 1,
                unit_price: finalAmount, 
                currency_id: "ARS",
              }],
            payer: { email: email },
            external_reference: resource_id, 
            notification_url: webhookUrl, // AHORA SÍ TIENE HTTPS
            back_urls: { 
                success: `${baseUrlStr}?step=payment&payment_status=success`, 
                failure: `${baseUrlStr}?step=payment&payment_status=failure`, 
                pending: `${baseUrlStr}?step=payment&payment_status=pending` 
            },
            auto_return: "approved",
            binary_mode: true,
            metadata: { original_id: resource_id }
          },
        };

        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");

        const redirectUrl = response.sandbox_init_point || response.init_point;
        
        console.log(`🚀 [MP-REDIRECT] Redirigiendo a: ${redirectUrl}`);

        return {
            id: response.id!,
            data: {
                id: response.id!,
                init_point: redirectUrl!, 
                original_init_point: response.init_point,
                sandbox_init_point: response.sandbox_init_point,
                redirect_url: redirectUrl!,
                resource_id: resource_id,
                transaction_amount: finalAmount
            },
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-ERROR-INIT]: ${error.message}`);
        console.error(error); 
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // 2. AUTORIZAR
  // -------------------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    const inputData = paymentSessionData as any;
    const cleanData = inputData.data || inputData.session_data || inputData;
    const resourceId = cleanData.resource_id ? String(cleanData.resource_id) : (cleanData.id || cleanData.session_id);
    const paymentId = cleanData.mp_payment_id || inputData.mp_payment_id;

    if (!resourceId && !paymentId) return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    try {
      const payment = new Payment(this.mercadoPagoConfig);
      let approvedPayment = null;
      if (paymentId) { try { const p = await payment.get({ id: paymentId }); if (p && p.status === 'approved') approvedPayment = p; } catch (e) {} }
      if (!approvedPayment && resourceId) {
          const s = await payment.search({ options: { external_reference: resourceId }});
          if (s.results && s.results.length > 0) approvedPayment = s.results.sort((a, b) => new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()).find(p => p.status === 'approved');
      }
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Autorizado: ${approvedPayment.id}`);
         return { status: PaymentSessionStatus.AUTHORIZED, data: { ...cleanData, mp_payment_id: approvedPayment.id, transaction_amount: approvedPayment.transaction_amount, payment_status: 'approved' } };
      }
      return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    } catch (err: any) { this.logger_.error(`🔥 [MP-AUTH-ERROR] ${err.message}`); return { status: PaymentSessionStatus.ERROR, data: paymentSessionData }; }
  }
// -------------------------------------------------------------------
  // 3. CAPTURAR (SQL CORREGIDO: Casting explícito de tipos)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
    const sessionData = input.session_data || input.data || {};
    this.logger_.info(`🔍 [MP-CAPTURE] Iniciando captura...`);
    
    const externalId = sessionData.mp_payment_id || input.mp_payment_id; 
    const resourceId = sessionData.resource_id || input.resource_id;     
    
    let amountToCapture = input.amount;
    if (!amountToCapture && sessionData.transaction_amount) amountToCapture = sessionData.transaction_amount;
    const finalAmount = parseFloat(Number(amountToCapture).toFixed(2));

    let targetPaymentId = input.id || input.payment_id; 

    if (finalAmount > 0) {
        try {
            const { Client } = require('pg'); 
            if (process.env.DATABASE_URL) {
               const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
               await client.connect();
               try {
                   // BÚSQUEDA DEL PAYMENT ID (Igual que antes...)
                   if (!targetPaymentId) {
                       console.log("🔍 [MP-SQL] ID no encontrado en input directo. Buscando en DB...");
                       
                       if (externalId) {
                           const res = await client.query("SELECT id FROM payment WHERE data->>'mp_payment_id' = $1 LIMIT 1", [String(externalId)]);
                           if (res.rows.length > 0) {
                               targetPaymentId = res.rows[0].id;
                               console.log(`✅ [MP-SQL] Encontrado por MP_ID: ${targetPaymentId}`);
                           }
                       }
                       
                       if (!targetPaymentId && resourceId) {
                           const res = await client.query("SELECT id FROM payment WHERE data->>'resource_id' = $1 LIMIT 1", [String(resourceId)]);
                           if (res.rows.length > 0) {
                               targetPaymentId = res.rows[0].id;
                               console.log(`✅ [MP-SQL] Encontrado por ResourceID: ${targetPaymentId}`);
                           }
                       }

                       if (!targetPaymentId) {
                           const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                           if (collectionId) {
                               const res = await client.query('SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1', [collectionId]);
                               if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                           }
                       }
                   }

                   if (targetPaymentId) {
                       this.logger_.info(`🔧 [MP-SQL] UPDATE directo en Payment ID: ${targetPaymentId}`);
                       
                       if (externalId) {
                           // 🔥 CORRECCIÓN AQUÍ: Agregamos "::text" al $2 para que Postgres no llore
                           const updateQuery = `
                               UPDATE payment 
                               SET 
                                   amount = $1, 
                                   captured_at = NOW(),
                                   data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('mp_payment_id', $2::text)
                               WHERE id = $3
                           `;
                           await client.query(updateQuery, [finalAmount, String(externalId), targetPaymentId]);
                           this.logger_.info(`✅ [MP-SQL] Base de datos actualizada. Estado: CAPTURED. mp_payment_id guardado.`);
                       } else {
                           const updateQuery = `UPDATE payment SET amount = $1, captured_at = NOW() WHERE id = $2`;
                           await client.query(updateQuery, [finalAmount, targetPaymentId]);
                           this.logger_.warn(`⚠️ [MP-SQL] Actualizado sin mp_payment_id (no disponible).`);
                       }
                   } else { 
                       this.logger_.warn(`⚠️ [MP-SQL] ERROR CRÍTICO: No se pudo encontrar la fila en la tabla 'payment'.`);
                   }
               } finally { await client.end(); }
            } else { this.logger_.error(`❌ [MP-SQL] Falta DATABASE_URL.`); }
        } catch (err: any) { this.logger_.error(`🔥 [MP-SQL-ERROR] DB Error: ${err.message}`); }
    }
    
    return { 
        ...sessionData, 
        status: 'captured', 
        amount_captured: finalAmount, 
        mp_capture_timestamp: new Date().toISOString(),
        mp_payment_id: externalId
    }; 
}

  // 4. CANCELAR
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;
      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`🚫 [MP-CANCEL] Cancelado en MP: ${paymentId}`);
          } catch (error) { this.logger_.warn(`⚠️ [MP-CANCEL] Falló cancelación: ${error}`); }
      }
      return sessionData; 
  }

  // -------------------------------------------------------------------
// 5. REEMBOLSAR (BLINDADO: Logging + Búsqueda desde DB)
// -------------------------------------------------------------------
async refundPayment(input: any): Promise<SessionData> { 
  // ============================================================
  // 🔍 LOGGING MASIVO DEL INPUT
  // ============================================================
  console.log("=".repeat(80));
  console.log("🔍 [MP-REFUND-DEBUG] INPUT COMPLETO RECIBIDO:");
  console.log("=".repeat(80));
  console.log(JSON.stringify(input, null, 2));
  console.log("=".repeat(80));
  console.log(`🔍 [MP-REFUND-DEBUG] Input keys: ${Object.keys(input).join(', ')}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.session_data existe: ${!!input.session_data}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.data existe: ${!!input.data}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.id: ${input.id}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.payment_id: ${input.payment_id}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.payment_collection_id: ${input.payment_collection_id}`);
  
  this.logger_.info(`🔍 [MP-REFUND] Iniciando reembolso...`);
  
  // BÚSQUEDA DEL ID DE MERCADOPAGO
  const sessionData = input.session_data || input.data || {};
  console.log(`🔍 [MP-REFUND-DEBUG] sessionData keys: ${Object.keys(sessionData).join(', ')}`);
  console.log(`🔍 [MP-REFUND-DEBUG] sessionData.mp_payment_id: ${sessionData.mp_payment_id}`);
  
  let mpPaymentId = sessionData.mp_payment_id || input.data?.mp_payment_id || input.mp_payment_id;
  
  // ============================================================
  // 🔍 ESTRATEGIA DE RESPALDO: Buscar en DB si no viene en input
  // ============================================================
  if (!mpPaymentId) {
      console.log("⚠️ [MP-REFUND-DEBUG] mp_payment_id NO encontrado en input. Buscando en DB...");
      
      try {
          const { Client } = require('pg');
          if (process.env.DATABASE_URL) {
              const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
              await client.connect();
              
              try {
                  // ESTRATEGIA 1: Buscar por payment.id de Medusa
                  const medusaPaymentId = input.id || input.payment_id;
                  if (medusaPaymentId) {
                      const res = await client.query(
                          "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE id = $1 LIMIT 1",
                          [medusaPaymentId]
                      );
                      if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                          mpPaymentId = res.rows[0].mp_payment_id;
                          console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por payment.id: ${mpPaymentId}`);
                      }
                  }
                  
                  // ESTRATEGIA 2: Buscar por payment_collection_id
                  if (!mpPaymentId) {
                      const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                      if (collectionId) {
                          const res = await client.query(
                              "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE payment_collection_id = $1 AND data->>'mp_payment_id' IS NOT NULL LIMIT 1",
                              [collectionId]
                          );
                          if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                              mpPaymentId = res.rows[0].mp_payment_id;
                              console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por collection_id: ${mpPaymentId}`);
                          }
                      }
                  }
                  
                  // ESTRATEGIA 3: Buscar por resource_id en sessionData
                  if (!mpPaymentId && sessionData.resource_id) {
                      const res = await client.query(
                          "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE data->>'resource_id' = $1 AND data->>'mp_payment_id' IS NOT NULL LIMIT 1",
                          [String(sessionData.resource_id)]
                      );
                      if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                          mpPaymentId = res.rows[0].mp_payment_id;
                          console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por resource_id: ${mpPaymentId}`);
                      }
                  }
                  
              } finally {
                  await client.end();
              }
          } else {
              console.error("❌ [MP-REFUND-DB] DATABASE_URL no disponible para búsqueda de respaldo.");
          }
      } catch (dbError: any) {
          console.error(`🔥 [MP-REFUND-DB-ERROR] Error buscando en DB: ${dbError.message}`);
          // No lanzamos error aquí, continuamos para ver si podemos hacer el refund de otra forma
      }
  }
  
  // VALIDACIÓN FINAL
  if (!mpPaymentId) {
      console.error("=".repeat(80));
      console.error("❌ [MP-REFUND-ERROR] CRÍTICO: No se encontró mp_payment_id de ninguna forma.");
      console.error("❌ [MP-REFUND-ERROR] sessionData completo:", JSON.stringify(sessionData, null, 2));
      console.error("=".repeat(80));
      throw new Error("No se puede reembolsar: Falta el ID de MercadoPago (mp_payment_id). No se encontró ni en input ni en base de datos.");
  }
  
  console.log(`✅ [MP-REFUND-DEBUG] mp_payment_id final a usar: ${mpPaymentId}`);
  
  // Cálculo del monto
  let refundAmount = input.amount;
  if (refundAmount === undefined && input.context?.amount) refundAmount = input.context?.amount;
  
  const finalAmount = parseFloat(Number(refundAmount).toFixed(2));
  const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

  console.log(`💸 [MP-REFUND] Reembolsando ${effectiveAmount} ARS sobre el pago ${mpPaymentId}`);

  try {
      const refund = new PaymentRefund(this.mercadoPagoConfig);
      const response = await refund.create({ 
          payment_id: mpPaymentId as string, 
          body: { amount: effectiveAmount } 
      });
      
      this.logger_.info(`✅ [MP-REFUND] Éxito! Reembolso ID: ${response.id} Status: ${response.status}`);
      
      return { 
          ...sessionData, 
          refund_id: response.id, 
          refund_status: response.status, 
          amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount,
          mp_payment_id: mpPaymentId // Asegurar que se persista
      };
  } catch (error: any) { 
      this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`);
      console.error("🔥 [MP-REFUND-ERROR] Error completo:", error);
      throw error; 
  }
}


  
  // -------------------------------------------------------------------
  // 6. OBTENER ESTADO (CORREGIDO: Para permitir Refund)
  // -------------------------------------------------------------------
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    const data = input.data || input.session_data || input;
    
    // Si en la data tenemos el timestamp de captura o el status 'captured'
    // le decimos a Medusa que ya está cobrado.
    if (data.mp_capture_timestamp || data.status === 'captured' || data.amount_captured > 0) {
        return { status: PaymentSessionStatus.CAPTURED };
    }
    
    return { status: PaymentSessionStatus.AUTHORIZED }; 
}
  
  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || input.data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default { services: [MercadoPagoProvider] };