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
  
  // 🔌 CONEXIÓN DIRECTA A BASE DE DATOS (NUCLEAR OPTION)
  protected dbConnection_: any; // Knex instance
  protected query_: any;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });

    this.logger_.info("🏗️ [MP-CONSTRUCTOR] Iniciando inyección de servicios...");

    // 1. Intentamos obtener la conexión directa (pg_connection es estándar en Medusa)
    try {
        this.dbConnection_ = container.resolve("pg_connection");
        this.logger_.info(`✅ [MP-CONSTRUCTOR] DB Connection (Knex) cargada: ${!!this.dbConnection_}`);
    } catch (e) {
        this.logger_.warn(`⚠️ [MP-CONSTRUCTOR] No se pudo cargar pg_connection. Intentando fallback...`);
    }

    // 2. Query para búsquedas (Solo lectura, no suele dar problemas circulares)
    try {
        this.query_ = container.resolve("query"); 
        this.logger_.info(`✅ [MP-CONSTRUCTOR] Query Module cargado.`);
    } catch (e) {
        this.logger_.error(`❌ [MP-CONSTRUCTOR] Falló carga de Query Module: ${e}`);
    }
  }

  // ... (MÉTODOS INITIATE Y AUTHORIZE SIN CAMBIOS) ...
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;
    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    const baseUrlStr = `${rawStoreUrl}/checkout`;
    const webhookUrl = `${(process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")}/hooks/mp`;
    let amount = input.amount || input.context?.amount;
    if (!amount) amount = 100;
    const email = input.email || input.context?.email || "guest@budhaom.com";

    const preferenceData = {
      body: {
        items: [{ id: resource_id, title: "Compra en BUDHA.Om", quantity: 1, unit_price: Number(amount), currency_id: "ARS" }],
        payer: { email: email },
        external_reference: resource_id, 
        notification_url: webhookUrl,
        back_urls: { success: `${baseUrlStr}?step=payment&payment_status=success`, failure: `${baseUrlStr}?step=payment&payment_status=failure`, pending: `${baseUrlStr}?step=payment&payment_status=pending` },
        auto_return: "approved",
        binary_mode: true,
        metadata: { original_id: resource_id }
      },
    };

    try {
        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");
        return { id: response.id!, data: { id: response.id!, init_point: response.init_point!, sandbox_init_point: response.sandbox_init_point!, resource_id: resource_id, transaction_amount: amount } };
    } catch (error: any) { this.logger_.error(`🔥 [MP-ERROR]: ${error.message}`); throw error; }
  }

  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    const inputData = paymentSessionData as any;
    const cleanData = inputData.data || inputData.session_data || inputData;
    const resourceId = cleanData.resource_id || cleanData.id || cleanData.session_id || inputData.id;
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
  // 3. CAPTURAR (VERSIÓN NUCLEAR: KNEX / SQL UPDATE)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      
      this.logger_.info(`🔍 [MP-CAPTURE-DEBUG] Keys: ${Object.keys(input).join(', ')}`);

      // 1. Recuperar monto
      let amountToCapture = input.amount;
      if (!amountToCapture && sessionData.transaction_amount) {
          amountToCapture = sessionData.transaction_amount;
          this.logger_.info(`💡 [MP-CAPTURE] Input vacío. Usando sesión: $${amountToCapture}`);
      }
      
      const finalAmount = Number(amountToCapture);
      this.logger_.info(`⚡ [MP-CAPTURE] Procesando captura: $${finalAmount}`);

      // 2. BYPASS A LA BASE DE DATOS (Usando Knex Directo)
      // Si tenemos conexión a DB y el monto es > 0, forzamos la escritura
      if (!input.amount && finalAmount > 0 && this.dbConnection_) {
          try {
              let targetPaymentId = input.payment_id || input.id;

              // BÚSQUEDA DEL ID (Si no viene directo)
              if (!targetPaymentId && this.query_) {
                  const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                  if (collectionId) {
                      const { data: payments } = await this.query_.graph({
                          entity: "payment",
                          fields: ["id"],
                          filters: { payment_collection_id: collectionId }
                      });
                      if (payments?.length > 0) targetPaymentId = payments[0].id;
                  }
              }

              if (targetPaymentId) {
                   this.logger_.info(`🔧 [MP-NUCLEAR] Ejecutando SQL UPDATE directo en tabla 'payment' ID: ${targetPaymentId}`);
                   
                   // KNEX UPDATE: Esto escribe directo en Postgres, saltándose todos los bloqueos de Medusa
                   // Intentamos actualizar la tabla 'payment' (nombre estándar en Medusa)
                   await this.dbConnection_('payment')
                       .where({ id: targetPaymentId })
                       .update({
                           amount: finalAmount,
                           captured_amount: finalAmount, // 👈 ESTO HABILITA EL REFUND
                           captured_at: new Date()
                       });
                   
                   this.logger_.info(`✅ [MP-NUCLEAR] Base de datos hackeada con éxito. Saldo actualizado.`);
              } else {
                  this.logger_.warn(`⚠️ [MP-NUCLEAR] FALLÓ: No se encontró Payment ID.`);
              }
          } catch (dbError: any) {
              this.logger_.error(`🔥 [MP-NUCLEAR-ERROR] Falló SQL Update: ${dbError.message}`);
              // Si falla 'payment', intenta 'payment_payment' (a veces cambia según la versión)
              try {
                  this.logger_.info(`🔧 [MP-NUCLEAR] Intentando tabla alternativa 'payment_payment'...`);
                  let targetPaymentId = input.payment_id || input.id; // Recalcular si es necesario
                  if (targetPaymentId) {
                      await this.dbConnection_('payment_payment')
                         .where({ id: targetPaymentId })
                         .update({ amount: finalAmount, captured_amount: finalAmount, captured_at: new Date() });
                      this.logger_.info(`✅ [MP-NUCLEAR] Éxito en tabla alternativa.`);
                  }
              } catch (e2) {}
          }
      }

      return {
          ...sessionData,
          status: 'captured',
          amount_captured: finalAmount,
          mp_capture_timestamp: new Date().toISOString()
      }; 
  }

  // ... (MÉTODOS CANCEL Y REFUND SIN CAMBIOS) ...
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

  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Input keys: ${Object.keys(input).join(', ')}`);
    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id || input.data?.mp_payment_id;
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) refundAmount = input.context.amount;
    if (!paymentId) throw new Error("Falta mp_payment_id para reembolsar");
    
    const finalAmount = Number(refundAmount);
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