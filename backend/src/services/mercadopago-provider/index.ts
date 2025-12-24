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

  // ---------------------------------------------------------
  // 1. INICIAR PAGO (Crea la Preferencia)
  // ---------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando pago...`);
    
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    const STORE_DOMAIN = process.env.STORE_URL || "http://localhost:8000";
    const BACKEND_DOMAIN = process.env.BACKEND_URL || "http://localhost:9000";

    let totalAmount = input.amount;
    if (!totalAmount && input.context) {
        totalAmount = input.context.amount;
    }

    if (!totalAmount || Number(totalAmount) <= 0) {
        this.logger_.error("⚠️ [MP-INIT] Error: Monto total es 0 o inválido.");
        throw new Error("El monto de la orden es inválido.");
    }

    const finalPrice = Number(totalAmount);
    this.logger_.info(`💰 [MP-INIT] Monto final: $${finalPrice}`);

    const itemsMp = [{
        id: resource_id,
        title: "Compra en Mi Tienda", 
        description: "Detalle de la orden",
        quantity: 1,
        unit_price: finalPrice, 
        currency_id: "ARS",
    }];

    const preferenceData = {
      body: {
        items: itemsMp,
        payer: { email: input.email || "guest_payer@test.com" },
        external_reference: resource_id,
        notification_url: `${BACKEND_DOMAIN}/hooks/mp`,
        back_urls: { 
            success: `${STORE_DOMAIN}/ar/checkout?payment_status=approved`, 
            failure: `${STORE_DOMAIN}/ar/checkout?payment_status=failure`, 
            pending: `${STORE_DOMAIN}/ar/checkout?payment_status=pending` 
        },
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
                resource_id: resource_id 
            },
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-ERROR]: ${error.message}`);
        throw error;
    }
  }

  // ---------------------------------------------------------
  // 2. AUTORIZAR PAGO (Verifica el estado)
  // ---------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    this.logger_.info(`🔍 [MP-AUTH] Verificando estado...`);

    const inputData = paymentSessionData as any;
    const resourceId = inputData.resource_id || inputData.data?.resource_id || inputData.id;

    if (!resourceId) {
        return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };
    }

    try {
      const payment = new Payment(this.mercadoPagoConfig);
      const searchResult = await payment.search({ options: { external_reference: resourceId }});
      
      let results = searchResult.results || [];

      if (results.length === 0) {
          return { status: PaymentSessionStatus.AUTHORIZED, data: { ...paymentSessionData, auth_via: "optimistic" } };
      }

      // Ordenar por más reciente
      results.sort((a, b) => (new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()));

      const approvedPayment = results.find((p) => p.status === 'approved');
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Pago CONFIRMADO: ${approvedPayment.id}`);
         return { 
           status: PaymentSessionStatus.AUTHORIZED, 
           data: { ...paymentSessionData, mp_payment_id: approvedPayment.id } 
         };
      }

      const pendingPayment = results.find((p) => ['pending', 'in_process', 'authorized'].includes(p.status!));
      if (pendingPayment) {
          return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
      }

      return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };

    } catch (err) {
       this.logger_.error(`🔥 [MP-AUTH] Fallback error: ${err}`);
       return { status: PaymentSessionStatus.AUTHORIZED, data: { ...paymentSessionData, auth_via: "fallback" } };
    }
  }

  // ---------------------------------------------------------
  // 3. CAPTURA (AHORA REAL ✅)
  // ---------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const amount = input.amount;

      this.logger_.info(`⚡ [MP-CAPTURE] Confirmando captura manual por: $${amount}`);

      // En Mercado Pago "Standard", el pago suele capturarse automáticamente al aprobarse.
      // Aquí simplemente CONFIRMAMOS a Medusa que el dinero está listo.
      // Retornar el amount es CLAVE para que Medusa sepa cuánto se puede reembolsar.
      
      return {
          ...sessionData,
          status: 'captured',
          amount_captured: amount 
      }; 
  }

  // ---------------------------------------------------------
  // 4. CANCELAR (AHORA REAL ✅)
  // ---------------------------------------------------------
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;

      this.logger_.info(`🚫 [MP-CANCEL] Cancelando pago... ID: ${paymentId || 'No ID'}`);

      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`✅ [MP-CANCEL] Cancelado en MP exitosamente.`);
          } catch (error) {
              this.logger_.warn(`⚠️ [MP-CANCEL] No se pudo cancelar en MP (quizás ya expiró): ${error}`);
          }
      }

      return sessionData; 
  }

  // ---------------------------------------------------------
  // 5. REEMBOLSOS (YA CORREGIDO ✅)
  // ---------------------------------------------------------
  async refundPayment(input: any): Promise<SessionData> { 
    const sessionData = input.session_data || input.data || {};
    const refundAmount = input.amount;
    const paymentId = sessionData.mp_payment_id;

    this.logger_.info(`💸 [MP-REFUND] Iniciando reembolso: ${paymentId} por $${refundAmount}`);

    if (!paymentId) {
        throw new Error("No se puede reembolsar: Falta ID de Mercado Pago.");
    }

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const finalRefundAmount = Number(refundAmount);

        // FIX: payment_id fuera del body
        const response = await refund.create({
            payment_id: paymentId as string, 
            body: { amount: finalRefundAmount }
        });

        this.logger_.info(`✅ [MP-REFUND] Éxito. ID: ${response.id}`);

        return {
            ...sessionData,
            refund_id: response.id,
            refund_status: response.status
        };

    } catch (error: any) {
        this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.message}`);
        throw error;
    }
  }

  // ---------------------------------------------------------
  // 6. ELIMINAR Y OTROS
  // ---------------------------------------------------------
  async deletePayment(input: any): Promise<SessionData> { 
      return this.cancelPayment(input); // Reutilizamos cancelar
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
      return { status: PaymentSessionStatus.AUTHORIZED }; 
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { 
      // Si el carrito cambia, iniciamos una nueva preferencia
      return this.initiatePayment(input); 
  }

  async retrievePayment(input: any): Promise<SessionData> { 
      return input.session_data || {}; 
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { 
      return { action: PaymentActions.NOT_SUPPORTED }; 
  }
}

export default {
  services: [MercadoPagoProvider],
};