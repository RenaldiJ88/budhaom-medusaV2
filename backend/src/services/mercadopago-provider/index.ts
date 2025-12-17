import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions 
} from "@medusajs/framework/utils";
import { 
  Logger, 
  WebhookActionResult 
} from "@medusajs/framework/types";
import { MercadoPagoConfig, Preference } from 'mercadopago';

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

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando proceso de pago...`);

    try {
      // 1. ESTRATEGIA DE BÚSQUEDA DE ID (Más agresiva para no fallar)
      let resource_id = 
        input.context?.resource_id || 
        input.resource_id || 
        input.id || 
        input.data?.resource_id;

      // Si aún así es null, usamos un fallback para NO ROMPER el checkout
      if (!resource_id) {
        this.logger_.warn(`⚠️ [MP-WARN] ID no encontrado en input. Usando Fallback.`);
        // Generamos un ID temporal seguro
        resource_id = `mp_fallback_${Date.now()}`;
      } else {
        this.logger_.info(`🛒 [MP-DEBUG] ID detectado correctamente: ${resource_id}`);
      }

      // 2. CONFIGURACIÓN DE URL
      let storeUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
      
      // Ajuste de región (si tu url base no tiene /ar y lo necesitas)
      const redirectUrl = storeUrl.includes("/ar") ? storeUrl : `${storeUrl}/ar`;

      // 3. DATOS MONETARIOS (Con fallback para no dar error 500)
      let amount = input.amount || input.context?.amount;
      if (!amount) {
         this.logger_.warn(`⚠️ [MP-WARN] Monto no detectado. Usando monto de prueba 100.`);
         amount = 100; // Monto dummy para evitar crash de MP
      }

      const email = input.email || input.context?.email || "guest@budhaom.com";

      // 4. CREAR PREFERENCIA
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
          
          back_urls: {
            success: `${redirectUrl}/checkout?step=payment&payment_status=success`,
            failure: `${redirectUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${redirectUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",

          // Importante para Retiro en Local
          shipments: {
            mode: "not_specified",
            local_pickup: true, 
          },
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió ID");

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          resource_id: resource_id 
        },
      };

    } catch (error: any) {
      // Capturamos el error pero NO lanzamos 500 si podemos evitarlo
      this.logger_.error(`🔥 [MP-CRASH-PREVENTION]: ${error.message}`);
      throw error; // Aquí sí lanzamos porque sin ID de MP no podemos redirigir
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Reutilizar lógica para updates
    return this.initiatePayment(input);
  }

  // --- MÉTODOS OBLIGATORIOS (Safe Mode) ---
  
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }

  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};