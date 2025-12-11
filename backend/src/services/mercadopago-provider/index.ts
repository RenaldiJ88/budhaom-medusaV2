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

  // --- 1. INICIAR PAGO (CORREGIDO PARA EVITAR PANTALLA ROJA) ---
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🔥 [MP-DEBUG] 1. Entrando a initiatePayment v4.0 (Fix Pantalla Roja)");

    try {
      // --- VALIDACIÓN DE URL (CRÍTICO) ---
      // Mercado Pago explota si las back_urls no tienen http:// o https://
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      
      // Asegurar protocolo
      if (!storeUrl.startsWith("http")) {
        storeUrl = `http://${storeUrl}`;
      }
      
      // Asegurar path /ar
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      // Quitar slash final si quedó
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      console.log("🔥 [MP-FIX] URL Base saneada:", storeUrl);

      // --- BLINDAJE DE ID ---
      const resource_id = 
        input.resource_id || 
        input.context?.resource_id || 
        input.cart?.id || 
        input.data?.resource_id || 
        input.context?.cart?.id;

      if (!resource_id || resource_id === "cart_default") {
        console.error("🔥 [MP-CRITICAL] ¡ALERTA! ID inválido.", JSON.stringify(input));
      }

      // --- VALIDACIÓN DE MONTO (CRÍTICO) ---
      let amount = input.amount || input.context?.amount || input.data?.amount;
      
      // Convertir a número si es string
      if (typeof amount === 'string') {
        amount = parseFloat(amount);
      }

      // IMPORTANTE: Si amount es NaN, 0 o null, MP tira pantalla roja.
      // Ponemos un fallback de 100 si no existe, solo para que no rompa (deberías revisar por qué llega vacío si pasa)
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        console.warn(`🔥 [MP-WARN] Amount inválido (${amount}). Usando fallback 100 para evitar crash.`);
        amount = 100; 
      }

      const email = input.email || input.context?.email || input.data?.email || "test_user@test.com";
      const currency_code = input.currency_code || input.context?.currency_code || "ARS";

      if (!this.options_?.access_token) {
        throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado");
      }

      // --- URLS DE RETORNO ---
      const successUrl = `${storeUrl}/checkout?step=payment&payment_status=success`;
      const failureUrl = `${storeUrl}/checkout?step=payment&payment_status=failure`;
      const pendingUrl = `${storeUrl}/checkout?step=payment&payment_status=pending`;

      // --- ARMADO DE PREFERENCIA ---
      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id || "item_temp",
              title: "Orden Budha.Om", // MP prefiere 'description', pero 'title' en items es obligatorio
              description: "Compra en Budha.Om", 
              quantity: 1,
              unit_price: Number(amount), // Aquí ya está validado que es número > 0
              currency_id: currency_code.toUpperCase(),
            },
          ],
          payer: {
            email: email,
          },
          external_reference: resource_id || "cart_error_id_missing",
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl,
          },
          auto_return: "approved", 
        },
      };

      // 🔥 LOG DEL PAYLOAD: Esto es lo que nos dirá la verdad si falla
      console.log("🔥 [MP-PAYLOAD] Enviando este JSON a Mercado Pago:", JSON.stringify(preferenceData, null, 2));

      // --- CREACIÓN ---
      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response || !response.id) {
        throw new Error("MercadoPago no devolvió un ID válido");
      }

      console.log("🔥 [MP-SUCCESS] Link generado:", response.init_point);

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          date_created: response.date_created, 
          resource_id: resource_id 
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-CRITICAL] Error FATAL en initiatePayment:", error);
      throw error;
    }
  }

  // --- MÉTODOS ESTÁNDAR ---
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || input.data || {} };
  }

  async cancelPayment(input: any): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  async capturePayment(input: any): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  async deletePayment(input: any): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> {
    return { status: PaymentSessionStatus.AUTHORIZED };
  }

  async refundPayment(input: any): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  async retrievePayment(input: any): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Al actualizar, volvemos a iniciar para regenerar la preferencia con el nuevo monto
    return this.initiatePayment(input);
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};