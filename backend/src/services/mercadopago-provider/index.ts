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

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🔥 [MP-DEBUG] Iniciando pago con webhooks");
    this.logger_.info("Iniciando pago MercadoPago", { input: JSON.stringify(input) });

    try {
      // 1. URL Saneada para back_urls
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // 2. URL para webhook (debe ser la URL pública del storefront)
      let webhookUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.STORE_URL || "http://localhost:8000";
      if (!webhookUrl.startsWith("http")) webhookUrl = `https://${webhookUrl}`;
      if (webhookUrl.endsWith("/")) webhookUrl = webhookUrl.slice(0, -1);
      webhookUrl = `${webhookUrl}/api/webhooks/mercadopago`;

      // 3. OBTENER CART_ID como external_reference (CRÍTICO para webhook)
      // En Medusa 2.0, el cart_id debería estar en input.context.cart_id o input.cart_id
      const cartId = input.context?.cart_id || input.cart_id || input.resource_id || input.id;
      
      if (!cartId) {
        const errorMsg = "No se pudo obtener el cart_id para external_reference";
        this.logger_.error(errorMsg, { input: JSON.stringify(input) });
        throw new Error(errorMsg);
      }

      console.log("📦 [MP-INFO] Cart ID detectado:", cartId);
      this.logger_.info("Cart ID detectado para external_reference", { cartId });

      // 4. Monto (Validación estricta)
      let amount = input.amount || input.context?.amount;
      if (typeof amount === 'string') amount = parseFloat(amount);
      if (!amount || isNaN(Number(amount))) {
        const errorMsg = "Monto inválido o no proporcionado";
        this.logger_.error(errorMsg, { amount: input.amount });
        throw new Error(errorMsg);
      }

      const email = input.email || input.context?.email || "guest@test.com";
      const currency = input.currency_code || "ARS";

      // 5. Preferencia MP con webhook configurado
      const preferenceData = {
        body: {
          items: [
            {
              id: cartId,
              title: "Compra Tienda",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { email: email },
          external_reference: cartId, // CRÍTICO: Usar cart_id para poder recuperarlo en el webhook
          notification_url: webhookUrl, // CRÍTICO: URL del webhook
          back_urls: {
            success: `${storeUrl}/checkout?step=payment&payment_status=success`,
            failure: `${storeUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${storeUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
        },
      };

      console.log("🔔 [MP-INFO] Webhook URL configurada:", webhookUrl);
      this.logger_.info("Preferencia MP creada", { 
        cartId, 
        webhookUrl, 
        amount: Number(amount),
        currency 
      });

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("MP no devolvió ID");

      console.log("✅ [MP-INFO] Preferencia creada exitosamente:", response.id);
      this.logger_.info("Preferencia MP creada exitosamente", { 
        preferenceId: response.id, 
        cartId 
      });

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          resource_id: cartId, // Guardamos el cart_id para referencia
          cart_id: cartId // También lo guardamos explícitamente
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-ERROR]", error);
      throw error;
    }
  }

  // --- UPDATE: Recupera el ID generado antes ---
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Si ya generamos un ID antes, lo volvemos a usar
    const savedId = input.data?.resource_id;
    if (savedId) {
       console.log("♻️ [MP-INFO] Usando ID guardado:", savedId);
       return this.initiatePayment({ ...input, resource_id: savedId });
    }
    // Si es una sesión zombie vieja, se generará uno nuevo en initiatePayment
    return this.initiatePayment(input);
  }

  // --- BOILERPLATE ---
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }
  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};