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
    this.logger_.info(`🔥 [MP-INIT] Iniciando. Analizando Input...`);
    
    // 🕵️ LOG CHIVATO: Esto nos mostrará en Railway qué diablos llega
    console.log("📦 [MP-DEBUG-DUMP]:", JSON.stringify(input, null, 2));

    try {
      // 1. ESTRATEGIA DE BÚSQUEDA DE ID (¡Ahora buscamos en TODOS lados!)
      let resource_id = 
        input.resource_id ||                 // Estándar Medusa v2
        input.context?.resource_id ||        // Contexto v2
        input.id ||                          // A veces el input es el objeto
        input.data?.resource_id ||           // Si viene dentro de data
        input.payment_session?.cart_id ||    // Si viene la sesión completa
        input.cart?.id;                      // Si viene el carrito

      // Si aún así es null, usamos un fallback pero AVISAMOS
      if (!resource_id) {
        this.logger_.warn(`⚠️ [MP-WARN] ID REAL NO ENCONTRADO. Revisa el log [MP-DEBUG-DUMP] arriba.`);
        // Fallback para que NO explote y puedas probar el flujo visual
        resource_id = `mp_fallback_${Date.now()}`;
      } else {
        this.logger_.info(`🛒 [MP-DEBUG] ID DETECTADO EXITOSAMENTE: ${resource_id}`);
      }

      // 2. CONFIGURACIÓN DE URL (Sin forzar /ar)
      // Prioridad: Env Var > Options > Default
      let storeUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      
      // Limpieza de URL
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
      
      // LOG DE URL para confirmar a dónde volverá
      this.logger_.info(`🌐 [MP-DEBUG] Base URL para retorno: ${storeUrl}`);

      // 3. DATOS MONETARIOS
      let amount = input.amount || input.context?.amount;
      if (!amount) {
         amount = 100; // Monto dummy de seguridad
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
          external_reference: resource_id, // CLAVE para que el Webhook funcione
          
          back_urls: {
            success: `${storeUrl}/checkout?step=payment&payment_status=success`,
            failure: `${storeUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${storeUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
          shipments: {
            mode: "not_specified",
            local_pickup: true, 
          },
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió ID");

      this.logger_.info(`✅ [MP-SUCCESS] Preferencia creada: ${response.id}`);

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          resource_id: resource_id 
        },
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-CRASH]: ${error.message}`);
      throw error;
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    return this.initiatePayment(input);
  }

  // Métodos Boilerplate
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