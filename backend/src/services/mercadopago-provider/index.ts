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
  // 3. CAPTURAR
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      this.logger_.info(`🔍 [MP-CAPTURE] Iniciando captura...`);
      let amountToCapture = input.amount;
      if (!amountToCapture && sessionData.transaction_amount) amountToCapture = sessionData.transaction_amount;
      const finalAmount = parseFloat(Number(amountToCapture).toFixed(2));

      if (!input.amount && finalAmount > 0) {
          try {
              const { Client } = require('pg'); 
              if (process.env.DATABASE_URL) {
                 const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
                 await client.connect();
                 try {
                     let targetPaymentId = input.payment_id || input.id;
                     if (!targetPaymentId) {
                         const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                         if (collectionId) {
                             const res = await client.query('SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1', [collectionId]);
                             if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                         }
                     }
                     if (targetPaymentId) {
                         this.logger_.info(`🔧 [MP-SQL] UPDATE directo en ID: ${targetPaymentId}`);
                         const updateQuery = `UPDATE payment SET amount = $1, captured_amount = $1, captured_at = NOW() WHERE id = $2`;
                         await client.query(updateQuery, [finalAmount, targetPaymentId]);
                         this.logger_.info(`✅ [MP-SQL] Base de datos actualizada.`);
                     } else { this.logger_.warn(`⚠️ [MP-SQL] No se encontró Payment ID.`); }
                 } finally { await client.end(); }
              } else { this.logger_.error(`❌ [MP-SQL] Falta DATABASE_URL.`); }
          } catch (err: any) { this.logger_.error(`🔥 [MP-SQL-ERROR] DB Error: ${err.message}`); }
      }
      return { ...sessionData, status: 'captured', amount_captured: finalAmount, mp_capture_timestamp: new Date().toISOString() }; 
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

  // 5. REEMBOLSAR
  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Iniciando reembolso...`);
    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id || input.data?.mp_payment_id;
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) refundAmount = input.context.amount;
    if (!paymentId) throw new Error("Falta mp_payment_id");
    
    const finalAmount = parseFloat(Number(refundAmount).toFixed(2));
    const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const response = await refund.create({ payment_id: paymentId as string, body: { amount: effectiveAmount } });
        this.logger_.info(`✅ [MP-REFUND] Éxito ID: ${response.id}`);
        return { ...sessionData, refund_id: response.id, refund_status: response.status, amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount };
    } catch (error: any) { this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`); throw error; }
  }

  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || input.data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default { services: [MercadoPagoProvider] };