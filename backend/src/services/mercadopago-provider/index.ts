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
  webhook_url?: string; // Opcional: por si quieres forzar la URL de notificacion
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
    
    // Inicializamos MP con el token
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info("🔥 [MP-INIT] Iniciando proceso de pago...");

    try {
      // 1. CONFIGURACIÓN DE URLS
      // Intentamos detectar la URL base, si no, fallback a localhost
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      
      // Limpieza de URL para evitar dobles slashes o rutas raras
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
      
      // Aseguramos que apunte al front correcto (ajustar según tu estructura /ar)
      // Si tu tienda siempre corre en /ar, descomenta la siguiente linea:
      // if (!storeUrl.includes("/ar")) storeUrl = `${storeUrl}/ar`;

      // 2. DETECCIÓN ROBUSTA DEL ID (El corazón del problema)
      // Medusa v2 a veces mueve el resource_id dependiendo del contexto
      let externalRef = 
        input.resource_id || 
        input.context?.resource_id || 
        input.data?.resource_id;

      // FALLBACK DE EMERGENCIA:
      // Si no hay ID de carrito, usamos el ID de la sesión de pago (payses_...)
      // Esto evita el "error_id_fatal".
      if (!externalRef) {
        this.logger_.warn("⚠️ [MP-WARN] No se detectó Cart ID. Usando PaymentSession ID como referencia.");
        externalRef = input.id;
      }

      // Si aun así es nulo (casi imposible), lanzamos error para no crear una orden zombie
      if (!externalRef) {
        throw new Error("⛔ [MP-FATAL] No se pudo obtener ninguna referencia para la orden.");
      }

      this.logger_.info(`✅ [MP-REF] Referencia vinculada: ${externalRef}`);

      // 3. PREPARACIÓN DE DATOS
      const email = input.email || input.context?.email || "guest@client.com";
      const currency = input.currency_code || "ARS";
      
      // Conversión segura de monto
      let amount = input.amount || input.context?.amount || input.data?.amount;
      amount = Number(amount);
      if (isNaN(amount)) throw new Error("El monto no es un número válido");

      // NOTA TÉCNICA: Medusa suele enviar montos en centavos (ej: 10000 para $100).
      // MercadoPago espera unit_price en unidades reales. 
      // Si ves que cobra 100 veces más, descomenta la línea de abajo:
      // amount = amount / 100; 

      // 4. CREACIÓN DE PREFERENCIA
      const preferenceData = {
        body: {
          items: [
            {
              id: externalRef, // Usamos la ref como ID de item
              title: `Orden ${externalRef.substring(0, 8)}...`, // Título corto
              quantity: 1,
              unit_price: amount,
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { 
            email: email 
          },
          // ¡AQUÍ ESTÁ LA CLAVE! Esta referencia es la que Medusa busca al volver
          external_reference: externalRef, 
          
          back_urls: {
            success: `${storeUrl}/checkout?step=payment&payment_status=success`,
            failure: `${storeUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${storeUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
          // Opcional: statement_descriptor para que salga lindo en el resumen de tarjeta
          statement_descriptor: "TIENDA MEDUSA",
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió un ID de preferencia");

      this.logger_.info(`🚀 [MP-SUCCESS] Preferencia creada: ${response.id}`);

      return {
        id: response.id,
        data: {
          id: response.id,
          init_point: response.init_point, 
          sandbox_init_point: response.sandbox_init_point,
          resource_id: externalRef // Guardamos qué ID usamos por si acaso
        },
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-ERROR] Falló initiatePayment: ${error.message}`);
      throw error;
    }
  }

  // --- MÉTODOS ESTÁNDAR (BOILERPLATE) ---
  // Estos métodos son necesarios para que Medusa no se queje, aunque no hagan mucho.

  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    // Asumimos autorizado si MP nos devolvió OK en el front
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }

  async cancelPayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async capturePayment(input: any): Promise<SessionData> { 
    // En MP la captura suele ser automática, devolvemos data tal cual
    return input.session_data || {}; 
  }

  async deletePayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    // Aquí podrías consultar a la API de MP si quisieras ser estricto
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }

  async refundPayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async retrievePayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Si el carrito cambia, regeneramos la preferencia
    return this.initiatePayment(input);
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};