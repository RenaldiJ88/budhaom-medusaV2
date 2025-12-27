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
  // 1. INICIAR PAGO (Crea la preferencia en MP)
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando...`);
    
    // Identificador único de la sesión
    let resource_id = input.data?.session_id || input.id || input.resource_id;

    if (!resource_id) {
        resource_id = `fallback_${Date.now()}`;
        this.logger_.warn(`⚠️ [MP-WARN] No ID. Usando Fallback: ${resource_id}`);
    }

    // Configuración de URLs
    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    
    const baseUrlStr = `${rawStoreUrl}/checkout`;
    const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
    const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
    const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

    // URL Webhook
    let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
    if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
    const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
    const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

    // Monto y Email
    let amount = input.amount || input.context?.amount;
    if (!amount) amount = 100; // Fallback de seguridad
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
        binary_mode: true, // Para que rechace o apruebe al instante
        metadata: { 
            original_id: resource_id
        }
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
                transaction_amount: amount // Guardamos el monto para usarlo en capture/refund
            },
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-ERROR]: ${error.message}`);
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // 2. AUTORIZAR (Verifica si el usuario pagó en MP)
  // -------------------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    const inputData = paymentSessionData as any;
    const resourceId = inputData.resource_id || inputData.id;

    if (!resourceId) {
        return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };
    }

    try {
      // Buscamos en MP si existe un pago con esta referencia
      const payment = new Payment(this.mercadoPagoConfig);
      const searchResult = await payment.search({ options: { external_reference: resourceId }});
      
      const results = searchResult.results || [];
      if (results.length === 0) {
          // Si no hay pago en MP, la sesión sigue autorizada pero "pendiente" de pago real
          return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
      }

      // Ordenamos por fecha para tomar el último intento
      results.sort((a, b) => (new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()));
      
      const approvedPayment = results.find((p) => p.status === 'approved');
      
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Pago encontrado: ${approvedPayment.id}`);
         
         // 🚨 IMPORTANTE: Guardamos el ID real de MP para poder hacer refunds después
         return { 
           status: PaymentSessionStatus.AUTHORIZED, 
           data: { 
               ...paymentSessionData, 
               mp_payment_id: approvedPayment.id,
               transaction_amount: approvedPayment.transaction_amount
           } 
         };
      }

      return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };

    } catch (err) {
       this.logger_.error(`🔥 [MP-AUTH] Error validando pago: ${err}`);
       return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };
    }
  }

  // -------------------------------------------------------------------
  // 3. CAPTURAR (Confirmar el cobro en Medusa)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      
      // En MP Checkout Pro, el pago ya se captura al pagar. 
      // Aquí solo tomamos el monto para registrarlo en Medusa.
      const amountToCapture = sessionData.transaction_amount || input.amount;

      this.logger_.info(`⚡ [MP-CAPTURE] Registrando captura por: $${amountToCapture}`);

      return {
          ...sessionData,
          status: 'captured',
          amount_captured: Number(amountToCapture) 
      }; 
  }

  // -------------------------------------------------------------------
  // 4. CANCELAR (Anular orden pendiente)
  // -------------------------------------------------------------------
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;

      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`🚫 [MP-CANCEL] Pago ${paymentId} cancelado en MP.`);
          } catch (error) {
              this.logger_.warn(`⚠️ [MP-CANCEL] No se pudo cancelar en MP (quizás ya estaba cerrado): ${error}`);
          }
      }
      return sessionData; 
  }

  // -------------------------------------------------------------------
  // 5. REEMBOLSAR (Devolver dinero) - LÓGICA BLINDADA
  // -------------------------------------------------------------------
  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Iniciando proceso...`);

    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id;

    // Buscamos el monto donde sea que Medusa lo esconda
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) {
        refundAmount = input.context.amount;
    }

    if (!paymentId) {
        const msg = "⛔ ERROR: No hay ID de MercadoPago (mp_payment_id) guardado. ¿Se autorizó correctamente?";
        this.logger_.error(msg);
        throw new Error(msg);
    }

    const finalAmount = Number(refundAmount);
    if (!finalAmount || finalAmount <= 0) {
        throw new Error(`Monto de reembolso inválido: ${refundAmount}`);
    }

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const response = await refund.create({
            payment_id: paymentId as string, 
            body: { amount: finalAmount }
        });

        this.logger_.info(`💸 [MP-REFUND] Exitoso. ID: ${response.id}`);

        return {
            ...sessionData,
            refund_id: response.id,
            refund_status: response.status
        };

    } catch (error: any) {
        const det = error.cause || error.message;
        this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${det}`);
        throw error;
    }
  }

  // Métodos standard requeridos
  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default {
  services: [MercadoPagoProvider],
};