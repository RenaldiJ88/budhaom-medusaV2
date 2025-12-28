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
      options: { timeout: 10000 }
    });
    console.log("📢 [MP-CONSTRUCTOR] Provider listo (Modo Diagnóstico Activado).");
  }

  // -------------------------------------------------------------------
  // 1. INICIAR PAGO CON DIAGNÓSTICO INTEGRADO
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log(`🔥 [MP-INIT] Iniciando...`);

    try {
        // --- 1. PREPARACIÓN DE DATOS ---
        let rawId = input.data?.session_id || input.id || input.resource_id;
        const resource_id = rawId ? String(rawId) : `fallback_${Date.now()}`;
        
        let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
        if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
        const baseUrlStr = `${rawStoreUrl}/checkout`;
        
        // Ajustá esto a tu dominio real de Railway si es necesario
        const backendUrl = (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
        const webhookUrl = `${backendUrl}/hooks/mp`;

        let rawAmount = input.amount || input.context?.amount;
        if (!rawAmount) rawAmount = 100;
        
        // Sanitizar Monto
        const finalAmount = parseFloat(Number(rawAmount).toFixed(2));
        const email = input.email || input.context?.email || "guest@budhaom.com";

        // Construcción del objeto
        const preferenceData = {
          body: {
            items: [{
                id: resource_id,
                title: "Compra en BUDHA.Om",
                quantity: 1,
                unit_price: finalAmount, 
                currency_id: "ARS",
              }],
            payer: { email: email },
            external_reference: resource_id, 
            notification_url: webhookUrl,
            back_urls: { 
                success: `${baseUrlStr}?step=payment&payment_status=success`, 
                failure: `${baseUrlStr}?step=payment&payment_status=failure`, 
                pending: `${baseUrlStr}?step=payment&payment_status=pending` 
            },
            auto_return: "approved",
            binary_mode: true,
            metadata: { original_id: resource_id }
          },
        };

        // ============================================================
        // 🔍 DIAGNÓSTICO PROFUNDO - COPIADO DEL PROMPT
        // ============================================================

        // 1. VERIFICACIÓN DE VARIABLES DE ENTORNO
        console.log("=".repeat(80));
        console.log("🔍 [MP-DIAGNOSTIC] VERIFICACIÓN DE VARIABLES DE ENTORNO");
        console.log("=".repeat(80));
        console.log(`STORE_URL: "${process.env.STORE_URL}" (Type: ${typeof process.env.STORE_URL})`);
        console.log(`RAILWAY_PUBLIC_DOMAIN: "${process.env.RAILWAY_PUBLIC_DOMAIN}" (Type: ${typeof process.env.RAILWAY_PUBLIC_DOMAIN})`);
        console.log(`BACKEND_URL: "${process.env.BACKEND_URL}" (Type: ${typeof process.env.BACKEND_URL})`);
        console.log(`rawStoreUrl (final): "${rawStoreUrl}"`);
        console.log(`backendUrl (final): "${backendUrl}"`);
        console.log(`webhookUrl (final): "${webhookUrl}"`);
        console.log(`baseUrlStr (final): "${baseUrlStr}"`);

        // 2. VALIDACIÓN DE URLs (Detectar undefined/null/vacíos)
        const urlsToCheck = {
            'rawStoreUrl': rawStoreUrl,
            'backendUrl': backendUrl,
            'webhookUrl': webhookUrl,
            'baseUrlStr': baseUrlStr,
            'success_url': `${baseUrlStr}?step=payment&payment_status=success`,
            'failure_url': `${baseUrlStr}?step=payment&payment_status=failure`,
            'pending_url': `${baseUrlStr}?step=payment&payment_status=pending`
        };

        console.log("\n🔍 [MP-DIAGNOSTIC] VALIDACIÓN DE URLs:");
        for (const [key, value] of Object.entries(urlsToCheck)) {
            const isValid = value && typeof value === 'string' && value.length > 0 && value !== 'undefined' && value !== 'null';
            console.log(`  ${key}: ${isValid ? '✅' : '❌'} "${value}"`);
            if (!isValid) {
                console.error(`    ⚠️ PROBLEMA DETECTADO: ${key} es inválido!`);
            }
        }

        // 3. VALIDACIÓN DE DATOS PRIMITIVOS
        console.log("\n🔍 [MP-DIAGNOSTIC] VALIDACIÓN DE DATOS:");
        console.log(`  resource_id: "${resource_id}" (Type: ${typeof resource_id}, Length: ${resource_id?.length})`);
        console.log(`  finalAmount: ${finalAmount} (Type: ${typeof finalAmount}, IsNaN: ${isNaN(finalAmount)})`);
        console.log(`  email: "${email}" (Type: ${typeof email})`);

        // 4. FUNCIÓN PARA DETECTAR VALORES PROBLEMÁTICOS EN JSON
        const detectProblematicValues = (obj: any, path = 'root'): string[] => {
            const problems: string[] = [];
            
            if (obj === null) {
                problems.push(`${path}: null`);
            } else if (obj === undefined) {
                problems.push(`${path}: undefined`);
            } else if (typeof obj === 'string' && obj === '') {
                problems.push(`${path}: string vacío`);
            } else if (typeof obj === 'object') {
                if (obj instanceof Date) {
                    problems.push(`${path}: objeto Date (problema de serialización)`);
                } else if (typeof obj === 'bigint') {
                    problems.push(`${path}: BigInt (problema de serialización)`);
                } else if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') {
                    problems.push(`${path}: objeto de tipo ${obj.constructor.name} (puede ser problemático)`);
                } else {
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            problems.push(...detectProblematicValues(obj[key], `${path}.${key}`));
                        }
                    }
                }
            }
            return problems;
        };

        // 5. ANÁLISIS PROFUNDO DEL preferenceData
        console.log("\n🔍 [MP-DIAGNOSTIC] ANÁLISIS DE preferenceData:");
        const detectedProblems = detectProblematicValues(preferenceData);
        if (detectedProblems.length > 0) {
            console.error("❌ VALORES PROBLEMÁTICOS DETECTADOS:");
            detectedProblems.forEach(problem => console.error(`  - ${problem}`));
        } else {
            console.log("✅ No se detectaron valores null/undefined/objetos complejos");
        }

        // 6. JSON STRINGIFY CON REPLACER PARA DETECTAR PROBLEMAS
        const jsonReplacer = (key: string, value: any): any => {
            if (value === undefined) {
                console.error(`⚠️ [JSON-REPLACER] undefined detectado en key: ${key}`);
                return '[UNDEFINED]'; 
            }
            if (value === null) {
                console.warn(`⚠️ [JSON-REPLACER] null detectado en key: ${key}`);
            }
            if (typeof value === 'bigint') {
                console.error(`⚠️ [JSON-REPLACER] BigInt detectado en key: ${key}, valor: ${value}`);
                return value.toString();
            }
            if (value instanceof Date) {
                console.warn(`⚠️ [JSON-REPLACER] Date detectado en key: ${key}, valor: ${value.toISOString()}`);
                return value.toISOString();
            }
            return value;
        };

        // 7. INTENTAR SERIALIZAR EL JSON
        console.log("\n🔍 [MP-DIAGNOSTIC] INTENTANDO SERIALIZAR JSON:");
        try {
            const jsonString = JSON.stringify(preferenceData, jsonReplacer, 2);
            console.log("✅ JSON serializado exitosamente");
            console.log("\n" + "=".repeat(80));
            console.log("📄 [MP-DIAGNOSTIC] JSON COMPLETO QUE SE ENVÍA A MERCADOPAGO:");
            console.log("=".repeat(80));
            console.log(jsonString);
            console.log("=".repeat(80));
            
            const jsonSize = Buffer.byteLength(jsonString, 'utf8');
            console.log(`📊 Tamaño del JSON: ${jsonSize} bytes (Límite MP: ~10KB)`);
            if (jsonSize > 10000) {
                console.error("❌ PROBLEMA: JSON demasiado grande!");
            }
            
        } catch (jsonError: any) {
            console.error("❌ ERROR AL SERIALIZAR JSON:");
            console.error(jsonError.message);
            console.error(jsonError.stack);
        }

        // 9. VALIDACIÓN ESPECÍFICA DE CAMPOS CRÍTICOS
        console.log("\n🔍 [MP-DIAGNOSTIC] VALIDACIÓN DE CAMPOS CRÍTICOS:");
        // Nota: Acceso seguro con ? para evitar crash si falta estructura
        const items = preferenceData.body.items || [];
        const firstItem = items[0] || {} as any;
        const payer = preferenceData.body.payer || {} as any;
        const backUrls = preferenceData.body.back_urls || {} as any;
        const metadata = preferenceData.body.metadata || {} as any;

        const criticalFields = {
            'items[0].id': firstItem.id,
            'items[0].title': firstItem.title,
            'items[0].quantity': firstItem.quantity,
            'items[0].unit_price': firstItem.unit_price,
            'items[0].currency_id': firstItem.currency_id,
            'payer.email': payer.email,
            'external_reference': preferenceData.body.external_reference,
            'notification_url': preferenceData.body.notification_url,
            'back_urls.success': backUrls.success,
            'back_urls.failure': backUrls.failure,
            'back_urls.pending': backUrls.pending,
            'metadata.original_id': metadata.original_id
        };

        for (const [field, value] of Object.entries(criticalFields)) {
            const isValid = value !== undefined && value !== null && value !== '';
            const type = typeof value;
            console.log(`  ${field}: ${isValid ? '✅' : '❌'} "${value}" (${type})`);
        }

        console.log("\n" + "=".repeat(80));
        console.log("🔍 [MP-DIAGNOSTIC] FIN DEL DIAGNÓSTICO");
        console.log("=".repeat(80) + "\n");

        // ============================================================
        // FIN DEL BLOQUE DE DIAGNÓSTICO
        // ============================================================

        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");

        const redirectUrl = response.sandbox_init_point || response.init_point;
        
        console.log(`🔥 [MP-DEBUG] URL Sandbox disponible: ${!!response.sandbox_init_point}`);
        console.log(`🚀 [MP-REDIRECT] Redirigiendo a: ${redirectUrl}`);

        return {
            id: response.id!,
            data: {
                id: response.id!,
                init_point: redirectUrl!, 
                original_init_point: response.init_point,
                sandbox_init_point: response.sandbox_init_point,
                redirect_url: redirectUrl!,
                resource_id: resource_id,
                transaction_amount: finalAmount
            },
        };
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-ERROR-INIT]: ${error.message}`);
        console.error(error); 
        throw error;
    }
  }

  // -------------------------------------------------------------------
  // 2. AUTORIZAR
  // -------------------------------------------------------------------
  async authorizePayment(paymentSessionData: SessionData): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
    const inputData = paymentSessionData as any;
    const cleanData = inputData.data || inputData.session_data || inputData;
    const resourceId = cleanData.resource_id ? String(cleanData.resource_id) : (cleanData.id || cleanData.session_id);
    const paymentId = cleanData.mp_payment_id || inputData.mp_payment_id;

    if (!resourceId && !paymentId) return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    try {
      const payment = new Payment(this.mercadoPagoConfig);
      let approvedPayment = null;
      if (paymentId) { try { const p = await payment.get({ id: paymentId }); if (p && p.status === 'approved') approvedPayment = p; } catch (e) {} }
      if (!approvedPayment && resourceId) {
          const s = await payment.search({ options: { external_reference: resourceId }});
          if (s.results && s.results.length > 0) approvedPayment = s.results.sort((a, b) => new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime()).find(p => p.status === 'approved');
      }
      if (approvedPayment) {
         this.logger_.info(`✅ [MP-AUTH] Autorizado: ${approvedPayment.id}`);
         return { status: PaymentSessionStatus.AUTHORIZED, data: { ...cleanData, mp_payment_id: approvedPayment.id, transaction_amount: approvedPayment.transaction_amount, payment_status: 'approved' } };
      }
      return { status: PaymentSessionStatus.PENDING, data: paymentSessionData };
    } catch (err: any) { this.logger_.error(`🔥 [MP-AUTH-ERROR] ${err.message}`); return { status: PaymentSessionStatus.ERROR, data: paymentSessionData }; }
  }

  // -------------------------------------------------------------------
  // 3. CAPTURAR (Directo a PG para robustez)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      this.logger_.info(`🔍 [MP-CAPTURE] Iniciando captura...`);
      let amountToCapture = input.amount;
      if (!amountToCapture && sessionData.transaction_amount) amountToCapture = sessionData.transaction_amount;
      const finalAmount = parseFloat(Number(amountToCapture).toFixed(2));

      if (!input.amount && finalAmount > 0) {
          try {
              const { Client } = require('pg'); 
              if (process.env.DATABASE_URL) {
                 const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
                 await client.connect();
                 try {
                     let targetPaymentId = input.payment_id || input.id;
                     if (!targetPaymentId) {
                         const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                         if (collectionId) {
                             const res = await client.query('SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1', [collectionId]);
                             if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                         }
                     }
                     if (targetPaymentId) {
                         this.logger_.info(`🔧 [MP-SQL] UPDATE directo en ID: ${targetPaymentId}`);
                         const updateQuery = `UPDATE payment SET amount = $1, captured_amount = $1, captured_at = NOW() WHERE id = $2`;
                         await client.query(updateQuery, [finalAmount, targetPaymentId]);
                         this.logger_.info(`✅ [MP-SQL] Base de datos actualizada.`);
                     } else { this.logger_.warn(`⚠️ [MP-SQL] No se encontró Payment ID.`); }
                 } finally { await client.end(); }
              } else { this.logger_.error(`❌ [MP-SQL] Falta DATABASE_URL.`); }
          } catch (err: any) { this.logger_.error(`🔥 [MP-SQL-ERROR] DB Error: ${err.message}`); }
      }
      return { ...sessionData, status: 'captured', amount_captured: finalAmount, mp_capture_timestamp: new Date().toISOString() }; 
  }

  // 4. CANCELAR
  async cancelPayment(input: any): Promise<SessionData> { 
      const sessionData = input.session_data || input.data || {};
      const paymentId = sessionData.mp_payment_id;
      if (paymentId) {
          try {
              const payment = new Payment(this.mercadoPagoConfig);
              await payment.cancel({ id: paymentId as string });
              this.logger_.info(`🚫 [MP-CANCEL] Cancelado en MP: ${paymentId}`);
          } catch (error) { this.logger_.warn(`⚠️ [MP-CANCEL] Falló cancelación: ${error}`); }
      }
      return sessionData; 
  }

  // 5. REEMBOLSAR
  async refundPayment(input: any): Promise<SessionData> { 
    this.logger_.info(`🔍 [MP-REFUND] Iniciando reembolso...`);
    const sessionData = input.session_data || input.data || {};
    const paymentId = sessionData.mp_payment_id || input.data?.mp_payment_id;
    let refundAmount = input.amount;
    if (refundAmount === undefined && input.context?.amount) refundAmount = input.context.amount;
    if (!paymentId) throw new Error("Falta mp_payment_id");
    
    const finalAmount = parseFloat(Number(refundAmount).toFixed(2));
    const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

    try {
        const refund = new PaymentRefund(this.mercadoPagoConfig);
        const response = await refund.create({ payment_id: paymentId as string, body: { amount: effectiveAmount } });
        this.logger_.info(`✅ [MP-REFUND] Éxito ID: ${response.id}`);
        return { ...sessionData, refund_id: response.id, refund_status: response.status, amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount };
    } catch (error: any) { this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`); throw error; }
  }

  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || input.data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default { services: [MercadoPagoProvider] };