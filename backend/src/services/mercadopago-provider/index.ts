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
    });
  }

  // -------------------------------------------------------------------
  // 1. INICIAR PAGO (Preference)
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Log para trackear inicios
    // this.logger_.info(`🔥 [MP-INIT] Iniciando...`);
    
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    // URLs
    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    
    const baseUrlStr = `${rawStoreUrl}/checkout`;
    const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
    const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
    const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

    // Webhook
    let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
    if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
    const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
    const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

    // Datos
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
  // 2. AUTORIZAR (Deep Search)
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
  // 3. CAPTURAR (Limpia - Cursor Approved)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      this.logger_.info(`⚡ [MP-CAPTURE-DEBUG] Input recibido: ${JSON.stringify(input)}`);
      const sessionData = input.session_data || input.data || {};
      
      // No forzamos status ni devolvemos amount_captured.
      // Dejamos que Medusa use el input.amount para sus cálculos internos.
      return {
          ...sessionData,
          mp_capture_timestamp: new Date().toISOString()
      }; 
  }

  // -------------------------------------------------------------------
  // 4. CANCELAR (Requerido por AbstractPaymentProvider)
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
  // 5. REEMBOLSAR (Blindado)
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
    if (!finalAmount || finalAmount <= 0) this.logger_.warn("⚠️ [MP-REFUND] Monto 0 detectado");

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const response = await refund.create({
            payment_id: paymentId as string, 
            body: { amount: finalAmount }
        });

        this.logger_.info(`✅ [MP-REFUND] Éxito ID: ${response.id}`);

        return {
            ...sessionData,
            refund_id: response.id,
            refund_status: response.status,
            amount_refunded: (sessionData.amount_refunded as number || 0) + finalAmount
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`);
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // MÉTODOS STANDARD OBLIGATORIOS (Boilerplate)
  // -------------------------------------------------------------------
  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
      return { status: PaymentSessionStatus.AUTHORIZED }; 
  }
  
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { 
      return this.initiatePayment(input); 
  }
  
  async retrievePayment(input: any): Promise<SessionData> { 
      return input.session_data || input.data || {}; 
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { 
      return { action: PaymentActions.NOT_SUPPORTED }; 
  }
}

export default {
  services: [MercadoPagoProvider],
};