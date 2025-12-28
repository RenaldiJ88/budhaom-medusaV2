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
  // 3. CAPTURAR (VERSIÓN FINAL: BUSCADOR INTELIGENTE)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
    const sessionData = input.session_data || input.data || {};
    this.logger_.info(`🔍 [MP-CAPTURE] Iniciando captura...`);
    
    // 1. Extraemos los IDs candidatos desde donde sea que estén
    const externalId = sessionData.mp_payment_id || input.mp_payment_id; // ID de MercadoPago (1325...)
    const resourceId = sessionData.resource_id || input.resource_id;     // ID de Sesión (payses_...)
    
    let amountToCapture = input.amount;
    if (!amountToCapture && sessionData.transaction_amount) amountToCapture = sessionData.transaction_amount;
    const finalAmount = parseFloat(Number(amountToCapture).toFixed(2));

    // 2. Definimos el ID Objetivo (Si viene directo, lo usamos)
    let targetPaymentId = input.id || input.payment_id; 

    if (finalAmount > 0) {
        try {
            const { Client } = require('pg'); 
            if (process.env.DATABASE_URL) {
               const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
               await client.connect();
               try {
                   // 3. ESTRATEGIA DE RECUPERACIÓN DE ID (Si no vino directo)
                   if (!targetPaymentId) {
                       console.log("🔍 [MP-SQL] ID no encontrado en input directo. Buscando en DB...");
                       
                       // INTENTO A: Buscar por ID de MercadoPago (El más seguro)
                       if (externalId) {
                           const res = await client.query(
                               "SELECT id FROM payment WHERE data->>'mp_payment_id' = $1 LIMIT 1", 
                               [String(externalId)]
                           );
                           if (res.rows.length > 0) {
                               targetPaymentId = res.rows[0].id;
                               console.log(`✅ [MP-SQL] Encontrado por MP_ID: ${targetPaymentId}`);
                           }
                       }
                       
                       // INTENTO B: Buscar por Resource ID (Session)
                       if (!targetPaymentId && resourceId) {
                           // A veces el resource_id se guarda en el campo data
                           const res = await client.query(
                               "SELECT id FROM payment WHERE data->>'resource_id' = $1 LIMIT 1", 
                               [String(resourceId)]
                           );
                           if (res.rows.length > 0) {
                               targetPaymentId = res.rows[0].id;
                               console.log(`✅ [MP-SQL] Encontrado por ResourceID: ${targetPaymentId}`);
                           }
                       }

                       // INTENTO C: Buscar por Collection (Último recurso)
                       if (!targetPaymentId) {
                           const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                           if (collectionId) {
                               const res = await client.query('SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1', [collectionId]);
                               if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                           }
                       }
                   }

                   // 4. EJECUTAR ACTUALIZACIÓN
                   if (targetPaymentId) {
                       this.logger_.info(`🔧 [MP-SQL] UPDATE directo en Payment ID: ${targetPaymentId}`);
                       const updateQuery = `UPDATE payment SET amount = $1, captured_amount = $1, captured_at = NOW() WHERE id = $2`;
                       await client.query(updateQuery, [finalAmount, targetPaymentId]);
                       this.logger_.info(`✅ [MP-SQL] Base de datos actualizada. Estado: CAPTURED.`);
                   } else { 
                       this.logger_.warn(`⚠️ [MP-SQL] ERROR CRÍTICO: No se pudo encontrar la fila en la tabla 'payment'.`);
                       this.logger_.warn(`Datos disponibles - MP_ID: ${externalId}, Res_ID: ${resourceId}`);
                   }
               } finally { await client.end(); }
            } else { this.logger_.error(`❌ [MP-SQL] Falta DATABASE_URL.`); }
        } catch (err: any) { this.logger_.error(`🔥 [MP-SQL-ERROR] DB Error: ${err.message}`); }
    }
    
    // Retornamos los datos actualizados para que Medusa se entere
    return { 
        ...sessionData, 
        status: 'captured', 
        amount_captured: finalAmount, 
        mp_capture_timestamp: new Date().toISOString() 
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
  // 5. REEMBOLSAR (MEJORADO: Búsqueda del ID de MP)
  // -------------------------------------------------------------------
  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Iniciando reembolso...`);
    
    // BÚSQUEDA DEL ID DE MERCADOPAGO (Es el dato crítico)
    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id || input.data?.mp_payment_id || input.mp_payment_id;
    
    console.log(`🔍 [MP-DEBUG-REFUND] Buscando mp_payment_id... Encontrado: ${paymentId}`);

    if (!paymentId) {
        console.error("❌ [MP-REFUND-ERROR] No se encontró el 'mp_payment_id'. Datos disponibles:", JSON.stringify(sessionData));
        throw new Error("No se puede reembolsar: Falta el ID de MercadoPago (mp_payment_id).");
    }
    
    // Cálculo del monto
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) refundAmount = input.context.amount;
    
    // Si no viene monto, reembolsamos el total original
    const finalAmount = parseFloat(Number(refundAmount).toFixed(2));
    const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

    console.log(`💸 [MP-REFUND] Reembolsando ${effectiveAmount} ARS sobre el pago ${paymentId}`);

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        // Creamos el reembolso en MP
        const response = await refund.create({ payment_id: paymentId as string, body: { amount: effectiveAmount } });
        
        this.logger_.info(`✅ [MP-REFUND] Éxito! Reembolso ID: ${response.id} Status: ${response.status}`);
        
        return { 
            ...sessionData, 
            refund_id: response.id, 
            refund_status: response.status, 
            amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount 
        };
    } catch (error: any) { 
        this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`); 
        console.error(error);
        throw error; 
    }
  }


  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || input.data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default { services: [MercadoPagoProvider] };