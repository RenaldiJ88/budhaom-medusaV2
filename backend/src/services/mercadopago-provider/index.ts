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

  // --- 1. INICIAR PAGO (CON LOGS DE FUEGO 🔥) ---
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🔥 [MP-DEBUG] 1. Entrando a initiatePayment");

    try {
      // 1. OBTENCIÓN Y VALIDACIÓN DE VARIABLES
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      
      // ---------------------------------------------------------
      // 🔥 FIX CRÍTICO: FORZAR /ar EN LA URL
      // Detectamos si falta el /ar y lo agregamos a la fuerza.
      // ---------------------------------------------------------
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         // Eliminamos barra final si existe para evitar dobles barras //ar
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
         console.log("🔥 [MP-FIX] Se agregó /ar forzosamente a la URL:", storeUrl);
      }

      // Aseguramos que amount sea un número
      let amount = input.amount || input.context?.amount || input.data?.amount;
      if (typeof amount === 'string') {
        amount = parseFloat(amount);
      }

      const email = input.email || input.context?.email || input.data?.email || "test_user@test.com";
      const currency_code = input.currency_code || input.context?.currency_code || "ARS";
      const resource_id = input.resource_id || input.context?.resource_id || "cart_default";

      console.log(`🔥 [MP-DEBUG] 2. Datos procesados: URL=${storeUrl}, Amount=${amount}, Email=${email}, Currency=${currency_code}`);

      if (!this.options_?.access_token) {
        throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado");
      }

      // 2. CONSTRUCCIÓN DE URLS 
      // 🔥 CAMBIO CRÍTICO: Se cambia 'step=review' por 'step=payment' para evitar el 404
      // Al volver a payment con status success, el frontend maneja mejor la redirección.
      const successUrl = `${storeUrl}/checkout?step=payment&payment_status=success`; 
      const failureUrl = `${storeUrl}/checkout?step=payment&payment_status=failure`;
      const pendingUrl = `${storeUrl}/checkout?step=payment&payment_status=pending`;

      // 3. ARMADO DE PREFERENCIA
      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id,
              title: "Orden Budha.Om",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency_code.toUpperCase(),
            },
          ],
          payer: {
            email: email,
          },
          // 🔥 CAMBIO CRÍTICO: Agregamos external_reference para vincular el pago al carrito
          external_reference: resource_id,
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl,
          },
          // auto_return: "approved", 
        },
      };

      console.log("🔥 [MP-DEBUG] 3. Enviando preferencia:", JSON.stringify(preferenceData, null, 2));

      // 4. CREACIÓN CON RETRY
      const preference = new Preference(this.mercadoPagoConfig);
      let response;
      const maxRetries = 2;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 1) console.log(`🔥 [MP-DEBUG] Reintento ${attempt}...`);
          response = await preference.create(preferenceData);
          break; 
        } catch (error: any) {
          const msg = error?.message || String(error);
          console.error(`🔥 [MP-ERROR] Intento ${attempt} falló: ${msg}`);
          
          if (msg.includes('timeout') && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw error;
        }
      }

      if (!response || !response.id) {
        throw new Error("MercadoPago no devolvió un ID válido");
      }

      console.log("🔥 [MP-DEBUG] 4. ÉXITO. ID:", response.id);
      console.log("🔥 [MP-DEBUG] 5. LINK:", response.init_point);

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          date_created: response.date_created, 
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-CRITICAL] Error FATAL en initiatePayment:");
      console.error(error); 
      if (error.cause) console.error("Causa:", JSON.stringify(error.cause, null, 2));
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
    // Si cambia el carrito, volvemos a iniciar el pago para actualizar el monto
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