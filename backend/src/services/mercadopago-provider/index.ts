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

// Configuraciones simples
type Options = {
  access_token: string;
  public_key?: string;
};

// Tipo genérico para la data de la sesión
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

    // Configurar MercadoPago
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  // --- 1. INICIAR PAGO (CON BLINDAJE DE ID 🛡️) ---
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🔥 [MP-DEBUG] 1. Entrando a initiatePayment v3.0 (Blindado)");

    try {
      // 1. OBTENCIÓN Y VALIDACIÓN DE VARIABLES
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      
      // Fix: Asegurar /ar en la URL para evitar redirecciones que pierdan sesión
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
         console.log("🔥 [MP-FIX] URL ajustada:", storeUrl);
      }

      // --- BLINDAJE DE ID DE CARRITO ---
      // Buscamos el ID en todos los lugares posibles para evitar 'cart_default'
      const resource_id = 
        input.resource_id || 
        input.context?.resource_id || 
        input.cart?.id || 
        input.data?.resource_id || 
        // Intento desesperado de buscar en el contexto profundo
        input.context?.cart?.id;

      console.log(`🔥 [MP-DEBUG] ID Detectado: ${resource_id}`);

      // VALIDACIÓN CRÍTICA: Si no hay ID, es peligroso seguir
      if (!resource_id || resource_id === "cart_default") {
        console.error("🔥 [MP-CRITICAL] ¡ALERTA! No se encontró un ID de carrito válido.", JSON.stringify(input));
        // Si quieres que falle en lugar de cobrar mal, descomenta la siguiente línea:
        // throw new Error("No se pudo identificar el carrito para el pago.");
      }

      // Aseguramos que amount sea un número
      let amount = input.amount || input.context?.amount || input.data?.amount;
      if (typeof amount === 'string') {
        amount = parseFloat(amount);
      }

      const email = input.email || input.context?.email || input.data?.email || "test_user@test.com";
      const currency_code = input.currency_code || input.context?.currency_code || "ARS";

      if (!this.options_?.access_token) {
        throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado");
      }

      // 2. CONSTRUCCIÓN DE URLS
      // Usamos step=payment para que el frontend procese el éxito correctamente
      const successUrl = `${storeUrl}/checkout?step=payment&payment_status=success`;
      const failureUrl = `${storeUrl}/checkout?step=payment&payment_status=failure`;
      const pendingUrl = `${storeUrl}/checkout?step=payment&payment_status=pending`;

      // 3. ARMADO DE PREFERENCIA
      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id || "item_temp", // Fallback solo para el item, no para la referencia
              title: "Orden Budha.Om",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency_code.toUpperCase(),
            },
          ],
          payer: {
            email: email,
          },
          // 🔥 CRÍTICO: Aquí va el ID real que recuperamos arriba
          external_reference: resource_id || "cart_error_id_missing",
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl,
          },
          // auto_return: "approved", 
        },
      };

      console.log("🔥 [MP-DEBUG] 3. Creando preferencia para ID:", resource_id);

      // 4. CREACIÓN CON RETRY
      const preference = new Preference(this.mercadoPagoConfig);
      let response;
      const maxRetries = 2;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await preference.create(preferenceData);
          break; 
        } catch (error: any) {
          console.error(`🔥 [MP-ERROR] Intento ${attempt} falló:`, error.message);
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000));
          else throw error;
        }
      }

      if (!response || !response.id) {
        throw new Error("MercadoPago no devolvió un ID válido");
      }

      console.log("🔥 [MP-DEBUG] 4. ÉXITO. Link:", response.init_point);

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          date_created: response.date_created, 
          resource_id: resource_id // Guardamos el ID que usamos
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-CRITICAL] Error FATAL en initiatePayment:", error);
      throw error;
    }
  }

  // --- 2. AUTORIZAR ---
  async authorizePayment(
    input: Record<string, any>
  ): Promise<{
    status: PaymentSessionStatus;
    data: SessionData;
  }> {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: input.session_data || input.data || {},
    };
  }

  // --- 3. CANCELAR ---
  async cancelPayment(
    input: Record<string, any>
  ): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  // --- 4. CAPTURAR ---
  async capturePayment(
    input: Record<string, any>
  ): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  // --- 5. BORRAR ---
  async deletePayment(
    input: Record<string, any>
  ): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  // --- 6. ESTADO ---
  async getPaymentStatus(
    input: Record<string, any>
  ): Promise<{ status: PaymentSessionStatus }> {
    return {
      status: PaymentSessionStatus.AUTHORIZED
    };
  }

  // --- 7. REEMBOLSAR ---
  async refundPayment(
    input: Record<string, any>
  ): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  // --- 8. RECUPERAR ---
  async retrievePayment(
    input: Record<string, any>
  ): Promise<SessionData> {
    return (input.session_data || input.data || {}) as SessionData;
  }

  // --- 9. ACTUALIZAR ---
  async updatePayment(
    input: any
  ): Promise<{ id: string, data: SessionData }> {
    return this.initiatePayment(input);
  }

  // --- 10. WEBHOOK ---
  async getWebhookActionAndData(
    input: { 
      data: Record<string, unknown>; 
      rawData: string | Buffer; 
      headers: Record<string, unknown>; 
    }
  ): Promise<WebhookActionResult> {
    return {
      action: PaymentActions.NOT_SUPPORTED
    };
  }
}

export default {
  services: [MercadoPagoProvider],
};