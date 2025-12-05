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
      // Nota: El timeout se maneja a nivel de red, puede configurarse con variables de entorno
      this.mercadoPagoConfig = new MercadoPagoConfig({
        accessToken: options.access_token,
      });
    }
  
    // --- 1. INICIAR PAGO ---
    async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
      try {
        // Validar que tenemos las opciones necesarias
        if (!this.options_?.access_token) {
          throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado");
        }

        // Extraer y validar parámetros
        const email = input.email || input.context?.email as string || input.data?.email as string || "test_user@test.com";
        const currency_code = input.currency_code || input.context?.currency_code as string || "ARS";
        // amount puede ser string, number o BigNumber - convertimos a number
        const amountRaw = input.amount || input.context?.amount || input.data?.amount;
        const amount = typeof amountRaw === 'string' ? parseFloat(amountRaw) : (typeof amountRaw === 'number' ? amountRaw : 0);
        const resource_id = input.resource_id || input.context?.resource_id as string || input.data?.resource_id as string || "cart_default";

        if (!amount || amount <= 0) {
          throw new Error(`Monto inválido: ${amount}`);
        }

        const storeUrl = process.env.STORE_URL || "http://localhost:8000";
        
        // Construir URLs de retorno - deben ser URLs absolutas válidas
        const successUrl = `${storeUrl}/checkout?step=review&payment_status=success`;
        const failureUrl = `${storeUrl}/checkout?step=payment&payment_status=failure`;
        const pendingUrl = `${storeUrl}/checkout?step=payment&payment_status=pending`;

        // Validar que las URLs estén definidas
        if (!successUrl || !failureUrl || !pendingUrl) {
          throw new Error("Las URLs de retorno no están definidas correctamente");
        }

        const preferenceData = {
          body: {
            items: [
              {
                id: resource_id,
                title: "Orden Budha.Om",
                quantity: 1,
                unit_price: amount,
                currency_id: currency_code.toUpperCase(),
              },
            ],
            payer: {
              email: email,
            },
            back_urls: {
              success: successUrl,
              failure: failureUrl,
              pending: pendingUrl,
            },
            // auto_return solo funciona si back_urls.success está definido
            // Comentado temporalmente para debug
            // auto_return: "approved",
          },
        };
        
        // Validar estructura antes de enviar
        if (!preferenceData.body.back_urls?.success) {
          throw new Error("back_urls.success debe estar definido cuando se usa auto_return");
        }

        if (this.logger_) {
          this.logger_.info(`Iniciando pago MercadoPago: amount=${amount}, currency=${currency_code}, email=${email}`);
          this.logger_.info(`URLs de retorno - success: ${successUrl}, failure: ${failureUrl}, pending: ${pendingUrl}`);
          this.logger_.info(`Preference data: ${JSON.stringify(preferenceData, null, 2)}`);
        }

        // Crear preferencia
        const preference = new Preference(this.mercadoPagoConfig);
        
        // Intentar crear la preferencia con retry en caso de timeout
        let response;
        const maxRetries = 2;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            if (this.logger_ && attempt > 1) {
              this.logger_.info(`Reintentando crear preferencia MercadoPago (intento ${attempt}/${maxRetries})`);
            }
            
            response = await preference.create(preferenceData);
            break; // Si tiene éxito, salir del loop
          } catch (error: any) {
            lastError = error;
            const errorMessage = error?.message || String(error);
            
            // Si es timeout y no es el último intento, reintentar
            if (errorMessage.includes('timeout') && attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos antes de reintentar
              continue;
            }
            
            // Si no es timeout o es el último intento, lanzar el error
            throw error;
          }
        }
        
        if (!response) {
          throw lastError || new Error('No se pudo crear la preferencia después de varios intentos');
        }

        if (!response || !response.id) {
          throw new Error("No se pudo obtener el ID de MercadoPago");
        }

        if (this.logger_) {
          this.logger_.info(`Preferencia creada exitosamente: ${response.id}`);
        }

        return {
          id: response.id,
          data: {
            id: response.id,
            preference_id: response.id,
            init_point: response.init_point,
            external_reference: resource_id,
          },
        };
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        
        // Manejo específico de errores de timeout
        if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          if (this.logger_) {
            this.logger_.error(`MercadoPago Timeout: La conexión con la API de MercadoPago excedió el tiempo límite. Verifica tu conexión a internet y las credenciales.`, error);
          }
          throw new Error(`Timeout al conectar con MercadoPago. Por favor, intenta nuevamente. Si el problema persiste, verifica tu conexión a internet y las credenciales de MercadoPago.`);
        }
        
        // Manejo de otros errores
        if (this.logger_) {
          this.logger_.error(`MercadoPago Error: ${errorMessage}`, error);
        }
        throw new Error(`Error iniciando MercadoPago: ${errorMessage}`);
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
  
    // --- 6. ESTADO (SOLUCIÓN ERROR 3) ---
    // El tipo de retorno debe ser un OBJETO que contenga el status
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