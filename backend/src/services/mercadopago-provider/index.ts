import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions,
  Modules,
  ContainerRegistrationKeys 
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
  
  // Servicios internos
  protected paymentModule_: any; 
  protected query_: any;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });

    // 💉 INYECCIÓN ESTÁNDAR (Como recomienda Cursor)
    this.logger_.info("🏗️ [MP-CONSTRUCTOR] Iniciando inyección de servicios...");
    
    try {
        this.paymentModule_ = container.resolve(Modules.PAYMENT);
        this.logger_.info(`✅ [MP-CONSTRUCTOR] Payment Module cargado.`);
    } catch (e) {
        this.logger_.error(`❌ [MP-CONSTRUCTOR] Falló carga de Payment Module: ${e}`);
    }

    try {
        this.query_ = container.resolve(ContainerRegistrationKeys.QUERY);
        this.logger_.info(`✅ [MP-CONSTRUCTOR] Query Module cargado.`);
    } catch (e) {
        this.logger_.error(`❌ [MP-CONSTRUCTOR] Falló carga de Query Module: ${e}`);
    }
  }

  // -------------------------------------------------------------------
  // 1. INICIAR PAGO
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    
    const baseUrlStr = `${rawStoreUrl}/checkout`;
    const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
    const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
    const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

    let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
    if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
    const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
    const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

    let amount = input.amount || input.context?.amount;
    if (!amount) amount = 100;
    const email = input.email || input.context?.email || "guest@budhaom.com";

    const preferenceData = {
      body: {
        items: [
          {
            id: resource_id,
            title: "Compra en BUDHA.Om",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "ARS",
          },
        ],
        payer: { email: email },
        external_reference: resource_id, 
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        binary_mode: true,
        metadata: { original_id: resource_id }
      },
    };

    try {
        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");

        return {
            id: response.id!,
            data: {
                id: response.id!,
                init_point: response.init_point!, 
                sandbox_init_point: response.sandbox_init_point!,
                resource_id: resource_id,
                transaction_amount: amount
            },
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-ERROR]: ${error.message}`);
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // 2. AUTORIZAR
  // -------------------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    const inputData = paymentSessionData as any;
    const cleanData = inputData.data || inputData.session_data || inputData;
    const resourceId = cleanData.resource_id || cleanData.id || cleanData.session_id || inputData.id;
    const paymentId = cleanData.mp_payment_id || inputData.mp_payment_id;

    if (!resourceId && !paymentId) {
        return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    }

    try {
      const payment = new Payment(this.mercadoPagoConfig);
      let approvedPayment = null;

      if (paymentId) {
          try {
             const paymentById = await payment.get({ id: paymentId });
             if (paymentById && paymentById.status === 'approved') approvedPayment = paymentById;
          } catch (e) { /* Ignorar */ }
      }

      if (!approvedPayment && resourceId) {
          const searchResult = await payment.search({ options: { external_reference: resourceId }});
          const results = searchResult.results || [];
          results.sort((a, b) => (new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()));
          approvedPayment = results.find((p) => p.status === 'approved');
      }

      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Autorizado: ${approvedPayment.id}`);
         return { 
           status: PaymentSessionStatus.AUTHORIZED, 
           data: { 
               ...cleanData, 
               mp_payment_id: approvedPayment.id,
               transaction_amount: approvedPayment.transaction_amount,
               payment_status: 'approved'
           } 
         };
      }
      return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    } catch (err: any) {
       this.logger_.error(`🔥 [MP-AUTH-ERROR] ${err.message}`);
       return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };
    }
  }

  // -------------------------------------------------------------------
  // 3. CAPTURAR (VERSIÓN OFICIAL: USANDO capturePayment DEL SERVICIO)
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

      // 2. USO DEL SERVICIO OFICIAL DE MEDUSA
      if (!input.amount && finalAmount > 0 && this.paymentModule_) {
          try {
              let targetPaymentId = input.payment_id || input.id;

              // BÚSQUEDA DEL ID (Triple estrategia)
              if (!targetPaymentId && this.query_) {
                  const collectionId = input.payment_collection_id || 
                                     input.payment_collection?.id || 
                                     input.payment_session?.payment_collection_id;
                  if (collectionId) {
                      const { data: payments } = await this.query_.graph({
                          entity: "payment",
                          fields: ["id", "amount"],
                          filters: { payment_collection_id: collectionId }
                      });
                      if (payments?.length > 0) targetPaymentId = payments[0].id;
                  }
              }
              if (!targetPaymentId && input.payment_session_id && this.query_) {
                  const { data: sessions } = await this.query_.graph({
                      entity: "payment_session",
                      fields: ["payment_collection.payments.id"],
                      filters: { id: input.payment_session_id }
                  });
                  targetPaymentId = sessions?.[0]?.payment_collection?.payments?.[0]?.id;
              }

              // 🔥 AQUÍ EL CAMBIO: Usamos 'capture' en lugar de 'update'
              // Esto hace que Medusa registre la captura OFICIALMENTE
              if (targetPaymentId) {
                   this.logger_.info(`🔧 [MP-FIX] Ejecutando CAPTURA INTERNA en ID: ${targetPaymentId}`);
                   
                   // Primero aseguramos que el monto sea correcto
                   await this.paymentModule_.updatePayments({
                       id: targetPaymentId,
                       amount: finalAmount
                   });

                   // Luego CAPTURAMOS oficialmente (Esto llena captured_at y captured_amount)
                   await this.paymentModule_.capturePayment({
                       payment_id: targetPaymentId,
                       amount: finalAmount
                   });
                   
                   this.logger_.info(`✅ [MP-FIX] Captura interna exitosa.`);
              } else {
                  this.logger_.warn(`⚠️ [MP-FIX] FALLÓ: No se encontró Payment ID.`);
              }
          } catch (dbError: any) {
              this.logger_.error(`🔥 [MP-FIX-ERROR] Falló captura interna: ${dbError.message}`);
          }
      }

      return {
          ...sessionData,
          status: 'captured',
          amount_captured: finalAmount,
          mp_capture_timestamp: new Date().toISOString()
      }; 
  }

  // -------------------------------------------------------------------
  // 4. CANCELAR
  // -------------------------------------------------------------------
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;

      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`🚫 [MP-CANCEL] Cancelado en MP: ${paymentId}`);
          } catch (error) {
              this.logger_.warn(`⚠️ [MP-CANCEL] Falló cancelación en MP: ${error}`);
          }
      }
      return sessionData; 
  }

  // -------------------------------------------------------------------
  // 5. REEMBOLSAR
  // -------------------------------------------------------------------
  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Input keys: ${Object.keys(input).join(', ')}`);

    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id || input.data?.mp_payment_id;
    
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) {
        refundAmount = input.context.amount;
    }

    if (!paymentId) throw new Error("Falta mp_payment_id para reembolsar");
    
    const finalAmount = Number(refundAmount);
    const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const response = await refund.create({
            payment_id: paymentId as string, 
            body: { amount: effectiveAmount }
        });

        this.logger_.info(`✅ [MP-REFUND] Éxito ID: ${response.id}`);

        return {
            ...sessionData,
            refund_id: response.id,
            refund_status: response.status,
            amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`);
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // STANDARD
  // -------------------------------------------------------------------
  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || input.data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default {
  services: [MercadoPagoProvider],
};