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
  
  // 👇👇👇 ESTA ES LA CLAVE QUE FALTABA 👇👇👇
  // Esto le dice al Admin: "Déjame escribir el monto manualmente"
  static features = {
    capture: "partial",
  };
  // 👆👆👆 FIN DEL CAMBIO 👆👆👆

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
  // 1. INICIAR PAGO
  // ---------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    if (input.data?.id) {
        return { id: input.data.id, data: input.data };
    }

    this.logger_.info(`🔥 [MP-INIT] Iniciando nueva preferencia...`);
    
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    const STORE_DOMAIN = process.env.STORE_URL || "http://localhost:8000";
    const BACKEND_DOMAIN = process.env.BACKEND_URL || "http://localhost:9000";

    let totalAmount = input.amount;
    if (!totalAmount && input.context) {
        totalAmount = input.context.amount;
    }

    if (!totalAmount || Number(totalAmount) <= 0) {
        throw new Error("El monto de la orden es inválido.");
    }

    const finalPrice = Number(totalAmount);

    const itemsMp = [{
        id: resource_id,
        title: "Compra en Tienda", 
        description: "Procesamiento de pedido",
        quantity: 1,
        unit_price: finalPrice, 
        currency_id: "ARS",
    }];

    const preferenceData = {
      body: {
        items: itemsMp,
        payer: { email: input.email || "guest@example.com" },
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
  // 2. AUTORIZAR PAGO
  // ---------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
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

      results.sort((a, b) => (new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()));

      const approvedPayment = results.find((p) => p.status === 'approved');
      
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Aprobado: ${approvedPayment.id} | Monto MP: ${approvedPayment.transaction_amount}`);
         
         return { 
           status: PaymentSessionStatus.AUTHORIZED, 
           data: { 
               ...paymentSessionData, 
               mp_payment_id: approvedPayment.id,
               transaction_amount: approvedPayment.transaction_amount,
               currency_id: approvedPayment.currency_id
           } 
         };
      }

      const pendingPayment = results.find((p) => ['pending', 'in_process', 'authorized'].includes(p.status!));
      if (pendingPayment) {
          return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
      }

      return { status: PaymentSessionStatus.ERROR, data: paymentSessionData };

    } catch (err) {
       this.logger_.error(`🔥 [MP-AUTH] Error: ${err}`);
       return { status: PaymentSessionStatus.AUTHORIZED, data: { ...paymentSessionData, auth_via: "fallback" } };
    }
  }

  // ---------------------------------------------------------
  // 3. CAPTURA (Con seguro anti-error)
  // ---------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      
      let amountToCapture = input.amount;

      // Fallback
      if (!amountToCapture && sessionData.transaction_amount) {
          this.logger_.warn(`⚠️ [MP-CAPTURE] Input amount undefined. Usando fallback de sesión: $${sessionData.transaction_amount}`);
          amountToCapture = sessionData.transaction_amount;
      }

      // Si después del fallback sigue vacío, es porque el Admin envió vacío Y la sesión falló.
      // Lanzamos error para obligar al usuario a reintentar manualmente.
      if (!amountToCapture) {
          const msg = "⛔ ERROR: Medusa envió captura vacía. Por favor ingresa el monto MANUALMENTE en el campo de captura.";
          this.logger_.error(msg);
          throw new Error(msg);
      }

      this.logger_.info(`⚡ [MP-CAPTURE] Capturando: $${amountToCapture}`);

      return {
          ...sessionData,
          status: 'captured',
          amount_captured: Number(amountToCapture) 
      }; 
  }

  // ---------------------------------------------------------
  // 4. CANCELAR
  // ---------------------------------------------------------
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;

      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`✅ [MP-CANCEL] Pago ${paymentId} cancelado.`);
          } catch (error) {
              this.logger_.warn(`⚠️ [MP-CANCEL] Error al cancelar en MP: ${error}`);
          }
      }
      return sessionData; 
  }

  // ---------------------------------------------------------
  // 5. REEMBOLSOS (REFUNDS)
  // ---------------------------------------------------------
  async refundPayment(input: any): Promise<SessionData> { 
    const sessionData = input.session_data || input.data || {};
    const refundAmount = input.amount;
    const paymentId = sessionData.mp_payment_id;

    this.logger_.info(`💸 [MP-REFUND] Intentando reembolsar $${refundAmount} ID: ${paymentId}`);

    if (!paymentId) {
        throw new Error("Falta ID de Mercado Pago para reembolsar.");
    }

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const finalRefundAmount = Number(refundAmount);

        const response = await refund.create({
            payment_id: paymentId as string, 
            body: { amount: finalRefundAmount }
        });

        this.logger_.info(`✅ [MP-REFUND] Exitoso. Refund ID: ${response.id}`);

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

  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default {
  services: [MercadoPagoProvider],
};