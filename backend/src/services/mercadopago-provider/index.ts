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
  // 2. AUTORIZAR (FIX: Búsqueda Profunda de ID)
  // -------------------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    // 1. LOG DE DEPURACIÓN CRÍTICO: Veamos qué diablos está llegando
    console.log(`📦 [MP-AUTH-RAW] Input completo recibido:`, JSON.stringify(paymentSessionData, null, 2));

    const inputData = paymentSessionData as any;
    
    // 2. DESEMPAQUETADO INTELIGENTE
    // A veces Medusa manda la data directo, a veces dentro de 'data', a veces 'session_data'
    const cleanData = inputData.data || inputData.session_data || inputData;

    // Buscamos el ID en todos los lugares posibles
    const resourceId = cleanData.resource_id || cleanData.id || cleanData.session_id || inputData.id;
    const paymentId = cleanData.mp_payment_id || inputData.mp_payment_id;

    this.logger_.info(`🕵️ [MP-AUTH] Buscando... Ref: ${resourceId} | MP ID: ${paymentId || 'N/A'}`);

    if (!resourceId && !paymentId) {
        this.logger_.warn(`⚠️ [MP-AUTH] ERROR: No se encontró ningún ID en la sesión.`);
        return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    }

    try {
      const payment = new Payment(this.mercadoPagoConfig);
      let approvedPayment = null;

      // ESTRATEGIA 1: Por ID de MP (Si ya lo guardamos antes)
      if (paymentId) {
          try {
             const paymentById = await payment.get({ id: paymentId });
             if (paymentById && paymentById.status === 'approved') {
                 approvedPayment = paymentById;
             }
          } catch (e) { /* Ignorar error de búsqueda */ }
      }

      // ESTRATEGIA 2: Por Referencia Externa (payses_...)
      if (!approvedPayment && resourceId) {
          // Buscamos pagos que tengan esta referencia externa
          const searchResult = await payment.search({ options: { external_reference: resourceId }});
          const results = searchResult.results || [];
          
          // Ordenamos por fecha (el más nuevo primero)
          results.sort((a, b) => (new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()));
          
          // Tomamos el primero que esté aprobado
          approvedPayment = results.find((p) => p.status === 'approved');
      }

      // RESULTADO FINAL
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] ¡PAGO ENCONTRADO! ID: ${approvedPayment.id}`);
         
         return { 
           status: PaymentSessionStatus.AUTHORIZED, 
           data: { 
               ...cleanData, // Guardamos la data limpia
               mp_payment_id: approvedPayment.id,
               transaction_amount: approvedPayment.transaction_amount,
               payment_status: 'approved'
           } 
         };
      }

      this.logger_.warn(`⏳ [MP-AUTH] Pago no encontrado o no aprobado para Ref: ${resourceId}`);
      return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };

    } catch (err: any) {
       this.logger_.error(`🔥 [MP-AUTH-ERROR] ${err.message}`);
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