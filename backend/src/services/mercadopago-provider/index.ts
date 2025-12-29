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
    console.log("📢 [MP-CONSTRUCTOR] Provider listo (Corrección HTTPS aplicada).");
  }

  // -------------------------------------------------------------------
  // 1. INICIAR PAGO
  // -------------------------------------------------------------------
  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log(`🔥 [MP-INIT] Iniciando...`);

    try {
        // --- 1. PREPARACIÓN DE DATOS ---
        let rawId = input.data?.session_id || input.id || input.resource_id;
        const resource_id = rawId ? String(rawId) : `fallback_${Date.now()}`;
        
        // CORRECCIÓN STORE URL
        let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
        if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
        if (!rawStoreUrl.startsWith("http")) rawStoreUrl = `https://${rawStoreUrl}`; // Forzar HTTPS
        const baseUrlStr = `${rawStoreUrl}/checkout`;
        
        // 🔥 CORRECCIÓN CRÍTICA: BACKEND URL (RAILWAY)
        // Railway devuelve el dominio sin protocolo. MP necesita https:// obligatoriamente.
        let backendUrl = (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
        if (!backendUrl.startsWith("http")) {
            backendUrl = `https://${backendUrl}`;
        }
        
        const webhookUrl = `${backendUrl}/hooks/mp`;

        let rawAmount = input.amount || input.context?.amount;
        if (!rawAmount) rawAmount = 100;
        
        // Sanitizar Monto
        const finalAmount = parseFloat(Number(rawAmount).toFixed(2));
        const email = input.email || input.context?.email || "guest@budhaom.com";

        console.log(`🔍 [MP-DEBUG] URLs finales -> Webhook: ${webhookUrl} | Back: ${baseUrlStr}`);

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
            notification_url: webhookUrl, // AHORA SÍ TIENE HTTPS
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

        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");

        const redirectUrl = response.sandbox_init_point || response.init_point;
        
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
  // 3. CAPTURAR (SOLUCIÓN FINAL: BUSQUEDA VÍA CART_ID)
  // -------------------------------------------------------------------
  async capturePayment(input: any): Promise<SessionData> { 
    const sessionData = input.session_data || input.data || {};
    this.logger_.info(`🔍 [MP-CAPTURE] Iniciando captura...`);
    
    const externalId = sessionData.mp_payment_id || input.mp_payment_id; 
    const resourceId = sessionData.resource_id || input.resource_id;     
    
    let amountToCapture = input.amount;
    if (!amountToCapture && sessionData.transaction_amount) amountToCapture = sessionData.transaction_amount;
    const finalAmount = parseFloat(Number(amountToCapture).toFixed(2));

    let targetPaymentId = input.id || input.payment_id; 

    if (finalAmount > 0) {
        try {
            const { Client } = require('pg'); 
            if (process.env.DATABASE_URL) {
               const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
               await client.connect();
               try {
                   // --- BLOQUE 1: BUSCAR PAYMENT ID ---
                   if (!targetPaymentId) {
                       if (externalId) {
                           const res = await client.query("SELECT id FROM payment WHERE data->>'mp_payment_id' = $1 LIMIT 1", [String(externalId)]);
                           if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                       }
                       if (!targetPaymentId && resourceId) {
                           const res = await client.query("SELECT id FROM payment WHERE data->>'resource_id' = $1 LIMIT 1", [String(resourceId)]);
                           if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                       }
                       if (!targetPaymentId) {
                           const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                           if (collectionId) {
                               const res = await client.query('SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1', [collectionId]);
                               if (res.rows.length > 0) targetPaymentId = res.rows[0].id;
                           }
                       }
                   }

                   if (targetPaymentId) {
                       // --- BLOQUE 2: ACTUALIZAR PAYMENT ---
                       this.logger_.info(`🔧 [MP-SQL] UPDATE directo en Payment ID: ${targetPaymentId}`);
                       
                       let paymentCollectionId: string | null = null;
                       const collectionIdQuery = await client.query('SELECT payment_collection_id FROM payment WHERE id = $1', [targetPaymentId]);
                       
                       if (collectionIdQuery.rows.length > 0) {
                           paymentCollectionId = collectionIdQuery.rows[0].payment_collection_id;
                       } else {
                           paymentCollectionId = input.payment_collection_id || input.payment_session?.payment_collection_id || null;
                       }
                       
                       if (externalId) {
                           const updatePaymentQuery = `
                               UPDATE payment 
                               SET amount = $1, captured_at = NOW(),
                                   data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('mp_payment_id', $2::text)
                               WHERE id = $3
                           `;
                           await client.query(updatePaymentQuery, [finalAmount, String(externalId), targetPaymentId]);
                       } else {
                           await client.query(`UPDATE payment SET amount = $1, captured_at = NOW() WHERE id = $2`, [finalAmount, targetPaymentId]);
                       }
                       this.logger_.info(`✅ [MP-SQL] Payment actualizado (CAPTURED).`);

                       // --- BLOQUE 3: ACTUALIZAR PAYMENT COLLECTION ---
                       if (paymentCollectionId) {
                           this.logger_.info(`🔧 [MP-SQL] Procesando Collection ID: ${paymentCollectionId}`);
                           
                           // Calcular total
                           const sumQuery = await client.query(
                               `SELECT COALESCE(SUM(amount), 0) as total_captured FROM payment WHERE payment_collection_id = $1 AND captured_at IS NOT NULL`,
                               [paymentCollectionId]
                           );
                           const totalCaptured = parseFloat(sumQuery.rows[0].total_captured) || 0;
                           
                           // Actualizar Collection (Intentamos strategies comunes)
                           try {
                               await client.query(`UPDATE payment_collection SET captured_amount = $1, updated_at = NOW() WHERE id = $2`, [totalCaptured, paymentCollectionId]);
                               this.logger_.info(`✅ [MP-SQL] Collection actualizado (captured_amount).`);
                           } catch (e) {
                               await client.query(`UPDATE payment_collection SET updated_at = NOW() WHERE id = $1`, [paymentCollectionId]);
                           }

                           // --- BLOQUE 4: ACTUALIZAR ORDER (CRÍTICO - EL PUENTE DEL CARRITO) ---
                           // 1. Buscamos el CART_ID desde el Payment Collection
                           const cartQuery = await client.query('SELECT currency_code FROM payment_collection WHERE id = $1', [paymentCollectionId]);
                           // Nota: Medusa v2 a veces no tiene cart_id directo en payment_collection, pero ORDER sí tiene cart_id.
                           // La mejor forma es buscar la Orden que tenga este payment_collection (si existe link) O buscar por cart.
                           
                           // ESTRATEGIA: Buscar Order que coincida con el payment_collection_id (si existe col) OJO: Ya vimos que falló.
                           // NUEVA ESTRATEGIA: Buscar el Cart ID asociado a este pago, y luego la orden.
                           
                           let orderId: string | null = null;

                           // Intento 1: Buscar en tabla "order" si existe alguna columna de enlace (Ya falló payment_collection_id).
                           // Intento 2: Buscar order a través del CART.
                           // Necesitamos el cart_id. Normalmente está en payment_collection, pero a veces no.
                           // Vamos a intentar buscar la orden que tenga un cart_id que coincida con lo que tengamos.
                           
                           // TRUCO: A veces input trae el cart_id
                           let cartId = input.cart_id || input.payment_session?.cart_id;
                           
                           // Si no tenemos cartId, intentamos sacarlo de payment_collection (si la columna existe)
                           if (!cartId) {
                               try {
                                   const cRes = await client.query('SELECT cart_id FROM payment_collection WHERE id = $1', [paymentCollectionId]);
                                   if (cRes.rows.length > 0) cartId = cRes.rows[0].cart_id;
                               } catch (e) { /* Columna no existe, ignorar */ }
                           }

                           if (cartId) {
                               this.logger_.info(`🔍 [MP-SQL] Cart ID encontrado: ${cartId}. Buscando Orden...`);
                               const orderRes = await client.query('SELECT id FROM "order" WHERE cart_id = $1 LIMIT 1', [cartId]);
                               if (orderRes.rows.length > 0) {
                                   orderId = orderRes.rows[0].id;
                                   this.logger_.info(`✅ [MP-SQL] Order encontrada por Cart ID: ${orderId}`);
                               }
                           }

                           // Si tenemos Order ID, actualizamos
                           if (orderId) {
                               // Actualizar payment_status en la orden
                               try {
                                   await client.query(`UPDATE "order" SET payment_status = 'captured', updated_at = NOW() WHERE id = $1`, [orderId]);
                                   this.logger_.info(`✅ [MP-SQL] Order payment_status -> 'captured'.`);
                               } catch (e: any) { this.logger_.warn(`⚠️ [MP-SQL] No se pudo actualizar payment_status en order: ${e.message}`); }

                               // Actualizar paid_total (Importante para el Refund)
                               try {
                                   await client.query(`UPDATE "order" SET paid_total = $1 WHERE id = $2`, [totalCaptured, orderId]);
                                   this.logger_.info(`✅ [MP-SQL] Order paid_total -> ${totalCaptured}.`);
                               } catch (e: any) { this.logger_.warn(`⚠️ [MP-SQL] No se pudo actualizar paid_total en order: ${e.message}`); }
                               
                               // Forzar JSON data por si acaso
                               try {
                                    await client.query(`
                                       UPDATE "order" 
                                       SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('payment_status', 'captured')
                                       WHERE id = $1`, [orderId]);
                               } catch (e) {}
                           } else {
                               this.logger_.warn(`⚠️ [MP-SQL] No se pudo encontrar la Orden asociada. El Refund podría fallar.`);
                           }
                       }
                   } else { 
                       this.logger_.warn(`⚠️ [MP-SQL] ERROR CRÍTICO: No se pudo encontrar el Payment.`);
                   }
               } finally { await client.end(); }
            } else { this.logger_.error(`❌ [MP-SQL] Falta DATABASE_URL.`); }
        } catch (err: any) { this.logger_.error(`🔥 [MP-SQL-ERROR] DB Error: ${err.message}`); }
    }
    
    return { 
        ...sessionData, 
        status: 'captured', 
        amount_captured: finalAmount, 
        mp_capture_timestamp: new Date().toISOString(),
        mp_payment_id: externalId
    }; 
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

  // -------------------------------------------------------------------
// 5. REEMBOLSAR (BLINDADO: Logging + Búsqueda desde DB)
// -------------------------------------------------------------------
async refundPayment(input: any): Promise<SessionData> { 
  // ============================================================
  // 🔍 LOGGING MASIVO DEL INPUT
  // ============================================================
  console.log("=".repeat(80));
  console.log("🔍 [MP-REFUND-DEBUG] INPUT COMPLETO RECIBIDO:");
  console.log("=".repeat(80));
  console.log(JSON.stringify(input, null, 2));
  console.log("=".repeat(80));
  console.log(`🔍 [MP-REFUND-DEBUG] Input keys: ${Object.keys(input).join(', ')}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.session_data existe: ${!!input.session_data}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.data existe: ${!!input.data}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.id: ${input.id}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.payment_id: ${input.payment_id}`);
  console.log(`🔍 [MP-REFUND-DEBUG] input.payment_collection_id: ${input.payment_collection_id}`);
  
  this.logger_.info(`🔍 [MP-REFUND] Iniciando reembolso...`);
  
  // BÚSQUEDA DEL ID DE MERCADOPAGO
  const sessionData = input.session_data || input.data || {};
  console.log(`🔍 [MP-REFUND-DEBUG] sessionData keys: ${Object.keys(sessionData).join(', ')}`);
  console.log(`🔍 [MP-REFUND-DEBUG] sessionData.mp_payment_id: ${sessionData.mp_payment_id}`);
  
  let mpPaymentId = sessionData.mp_payment_id || input.data?.mp_payment_id || input.mp_payment_id;
  
  // ============================================================
  // 🔍 ESTRATEGIA DE RESPALDO: Buscar en DB si no viene en input
  // ============================================================
  if (!mpPaymentId) {
      console.log("⚠️ [MP-REFUND-DEBUG] mp_payment_id NO encontrado en input. Buscando en DB...");
      
      try {
          const { Client } = require('pg');
          if (process.env.DATABASE_URL) {
              const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
              await client.connect();
              
              try {
                  // ESTRATEGIA 1: Buscar por payment.id de Medusa
                  const medusaPaymentId = input.id || input.payment_id;
                  if (medusaPaymentId) {
                      const res = await client.query(
                          "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE id = $1 LIMIT 1",
                          [medusaPaymentId]
                      );
                      if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                          mpPaymentId = res.rows[0].mp_payment_id;
                          console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por payment.id: ${mpPaymentId}`);
                      }
                  }
                  
                  // ESTRATEGIA 2: Buscar por payment_collection_id
                  if (!mpPaymentId) {
                      const collectionId = input.payment_collection_id || input.payment_session?.payment_collection_id;
                      if (collectionId) {
                          const res = await client.query(
                              "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE payment_collection_id = $1 AND data->>'mp_payment_id' IS NOT NULL LIMIT 1",
                              [collectionId]
                          );
                          if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                              mpPaymentId = res.rows[0].mp_payment_id;
                              console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por collection_id: ${mpPaymentId}`);
                          }
                      }
                  }
                  
                  // ESTRATEGIA 3: Buscar por resource_id en sessionData
                  if (!mpPaymentId && sessionData.resource_id) {
                      const res = await client.query(
                          "SELECT data->>'mp_payment_id' as mp_payment_id FROM payment WHERE data->>'resource_id' = $1 AND data->>'mp_payment_id' IS NOT NULL LIMIT 1",
                          [String(sessionData.resource_id)]
                      );
                      if (res.rows.length > 0 && res.rows[0].mp_payment_id) {
                          mpPaymentId = res.rows[0].mp_payment_id;
                          console.log(`✅ [MP-REFUND-DB] mp_payment_id recuperado desde DB por resource_id: ${mpPaymentId}`);
                      }
                  }
                  
              } finally {
                  await client.end();
              }
          } else {
              console.error("❌ [MP-REFUND-DB] DATABASE_URL no disponible para búsqueda de respaldo.");
          }
      } catch (dbError: any) {
          console.error(`🔥 [MP-REFUND-DB-ERROR] Error buscando en DB: ${dbError.message}`);
          // No lanzamos error aquí, continuamos para ver si podemos hacer el refund de otra forma
      }
  }
  
  // VALIDACIÓN FINAL
  if (!mpPaymentId) {
      console.error("=".repeat(80));
      console.error("❌ [MP-REFUND-ERROR] CRÍTICO: No se encontró mp_payment_id de ninguna forma.");
      console.error("❌ [MP-REFUND-ERROR] sessionData completo:", JSON.stringify(sessionData, null, 2));
      console.error("=".repeat(80));
      throw new Error("No se puede reembolsar: Falta el ID de MercadoPago (mp_payment_id). No se encontró ni en input ni en base de datos.");
  }
  
  console.log(`✅ [MP-REFUND-DEBUG] mp_payment_id final a usar: ${mpPaymentId}`);
  
  // Cálculo del monto
  let refundAmount = input.amount;
  if (refundAmount === undefined && input.context?.amount) refundAmount = input.context?.amount;
  
  const finalAmount = parseFloat(Number(refundAmount).toFixed(2));
  const effectiveAmount = (finalAmount > 0) ? finalAmount : Number(sessionData.transaction_amount);

  console.log(`💸 [MP-REFUND] Reembolsando ${effectiveAmount} ARS sobre el pago ${mpPaymentId}`);

  try {
      const refund = new PaymentRefund(this.mercadoPagoConfig);
      const response = await refund.create({ 
          payment_id: mpPaymentId as string, 
          body: { amount: effectiveAmount } 
      });
      
      this.logger_.info(`✅ [MP-REFUND] Éxito! Reembolso ID: ${response.id} Status: ${response.status}`);
      
      return { 
          ...sessionData, 
          refund_id: response.id, 
          refund_status: response.status, 
          amount_refunded: (sessionData.amount_refunded as number || 0) + effectiveAmount,
          mp_payment_id: mpPaymentId // Asegurar que se persista
      };
  } catch (error: any) { 
      this.logger_.error(`🔥 [MP-REFUND-ERROR]: ${error.cause || error.message}`);
      console.error("🔥 [MP-REFUND-ERROR] Error completo:", error);
      throw error; 
  }
}


  
  // -------------------------------------------------------------------
// 6. OBTENER ESTADO (CORREGIDO: Consulta BD real)
// -------------------------------------------------------------------
async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> {
  this.logger_.info(`🔍 [MP-STATUS] Consultando estado real desde BD...`);
  
  try {
      // Reutilizar retrievePayment para obtener datos frescos
      const freshData = await this.retrievePayment(input);
      
      // Determinar el estado basado en los datos de BD
      if (freshData.status === 'captured' || freshData.captured_at || freshData.mp_capture_timestamp) {
          this.logger_.info(`✅ [MP-STATUS] Estado: CAPTURED (confirmado por BD)`);
          return { status: PaymentSessionStatus.CAPTURED };
      }
      
      if (freshData.status === 'authorized' || freshData.mp_payment_id) {
          this.logger_.info(`✅ [MP-STATUS] Estado: AUTHORIZED (confirmado por BD)`);
          return { status: PaymentSessionStatus.AUTHORIZED };
      }
      
      // Fallback: revisar datos del input original como última opción
      const inputData = input.data || input.session_data || input;
      if (inputData.mp_capture_timestamp || inputData.status === 'captured' || inputData.amount_captured > 0) {
          this.logger_.warn(`⚠️ [MP-STATUS] Usando datos del input (BD no disponible). Estado: CAPTURED`);
          return { status: PaymentSessionStatus.CAPTURED };
      }
      
      this.logger_.info(`✅ [MP-STATUS] Estado: AUTHORIZED (por defecto)`);
      return { status: PaymentSessionStatus.AUTHORIZED };
      
  } catch (error: any) {
      this.logger_.error(`🔥 [MP-STATUS-ERROR] Error obteniendo estado: ${error.message}`);
      // Fallback seguro: retornar AUTHORIZED si hay error
      return { status: PaymentSessionStatus.AUTHORIZED };
  }
}

// -------------------------------------------------------------------
  // 7. OBTENER PAGO (CORREGIDO: Consulta BD + Fix TypeScript)
  // -------------------------------------------------------------------
  async retrievePayment(input: any): Promise<SessionData> {
    this.logger_.info(`🔍 [MP-RETRIEVE] Consultando estado real desde BD...`);
    
    try {
        const { Client } = require('pg');
        
        if (!process.env.DATABASE_URL) {
            this.logger_.warn(`⚠️ [MP-RETRIEVE] DATABASE_URL no disponible. Retornando datos del input.`);
            return input.session_data || input.data || {};
        }
        
        const client = new Client({ 
            connectionString: process.env.DATABASE_URL, 
            ssl: { rejectUnauthorized: false } 
        });
        
        await client.connect();
        
        try {
            // ESTRATEGIA 1: Buscar por payment.id directo
            let paymentId = input.id || input.payment_id || input.payment?.id;
            
            // ESTRATEGIA 2: Buscar por payment_collection_id
            if (!paymentId) {
                const collectionId = input.payment_collection_id || 
                                     input.payment_collection?.id ||
                                     input.payment_session?.payment_collection_id;
                if (collectionId) {
                    const res = await client.query(
                        'SELECT id FROM payment WHERE payment_collection_id = $1 LIMIT 1',
                        [collectionId]
                    );
                    if (res.rows.length > 0) {
                        paymentId = res.rows[0].id;
                        this.logger_.info(`✅ [MP-RETRIEVE] Payment ID encontrado por collection_id: ${paymentId}`);
                    }
                }
            }
            
            // ESTRATEGIA 3: Buscar por mp_payment_id en data
            if (!paymentId) {
                const sessionData = input.session_data || input.data || {};
                const mpPaymentId = sessionData.mp_payment_id || input.mp_payment_id;
                if (mpPaymentId) {
                    const res = await client.query(
                        "SELECT id FROM payment WHERE data->>'mp_payment_id' = $1 LIMIT 1",
                        [String(mpPaymentId)]
                    );
                    if (res.rows.length > 0) {
                        paymentId = res.rows[0].id;
                        this.logger_.info(`✅ [MP-RETRIEVE] Payment ID encontrado por mp_payment_id: ${paymentId}`);
                    }
                }
            }
            
            // ESTRATEGIA 4: Buscar por resource_id en data
            if (!paymentId) {
                const sessionData = input.session_data || input.data || {};
                const resourceId = sessionData.resource_id || input.resource_id;
                if (resourceId) {
                    const res = await client.query(
                        "SELECT id FROM payment WHERE data->>'resource_id' = $1 LIMIT 1",
                        [String(resourceId)]
                    );
                    if (res.rows.length > 0) {
                        paymentId = res.rows[0].id;
                        this.logger_.info(`✅ [MP-RETRIEVE] Payment ID encontrado por resource_id: ${paymentId}`);
                    }
                }
            }
            
            if (!paymentId) {
                this.logger_.warn(`⚠️ [MP-RETRIEVE] No se pudo encontrar payment ID. Retornando datos del input.`);
                return input.session_data || input.data || {};
            }
            
            // CONSULTA PRINCIPAL: Obtener datos frescos de la BD
            const queryResult = await client.query(
                `SELECT 
                    id,
                    amount,
                    captured_at,
                    data,
                    created_at,
                    updated_at
                 FROM payment 
                 WHERE id = $1 
                 LIMIT 1`,
                [paymentId]
            );
            
            if (queryResult.rows.length === 0) {
                this.logger_.warn(`⚠️ [MP-RETRIEVE] Payment ${paymentId} no encontrado en BD. Retornando datos del input.`);
                return input.session_data || input.data || {};
            }
            
            const dbRow = queryResult.rows[0];
            
            // 🔥 CORRECCIÓN TS: Usamos 'any' para evitar el error de propiedades inexistentes
            let paymentData: any = {}; 
            try {
                paymentData = typeof dbRow.data === 'string' ? JSON.parse(dbRow.data) : (dbRow.data || {});
            } catch (e) {
                this.logger_.warn(`⚠️ [MP-RETRIEVE] Error parseando data JSONB: ${e}`);
                paymentData = {};
            }
            
            // Determinar el estado basado en captured_at
            const isCaptured = !!dbRow.captured_at;
            
            // Construir el objeto de retorno con datos frescos de BD
            const freshData: SessionData = {
                ...paymentData, // Mantener todos los datos existentes en data
                id: dbRow.id,
                amount: dbRow.amount,
                transaction_amount: dbRow.amount, // Alias para compatibilidad
                mp_payment_id: paymentData.mp_payment_id || null, // Ahora TS no se queja
                resource_id: paymentData.resource_id || null,     // Ahora TS no se queja
                status: isCaptured ? 'captured' : 'authorized',
                captured_at: dbRow.captured_at ? dbRow.captured_at.toISOString() : null,
                mp_capture_timestamp: dbRow.captured_at ? dbRow.captured_at.toISOString() : null,
                amount_captured: isCaptured ? dbRow.amount : null,
                created_at: dbRow.created_at?.toISOString(),
                updated_at: dbRow.updated_at?.toISOString()
            };
            
            this.logger_.info(`✅ [MP-RETRIEVE] Datos frescos obtenidos. Estado: ${freshData.status}, mp_payment_id: ${freshData.mp_payment_id}`);
            
            return freshData;
            
        } finally {
            await client.end();
        }
        
    } catch (error: any) {
        this.logger_.error(`🔥 [MP-RETRIEVE-ERROR] Error consultando BD: ${error.message}`);
        // En caso de error, retornar datos del input como fallback
        return input.session_data || input.data || {};
    }
}
  
  async deletePayment(input: any): Promise<SessionData> { return this.cancelPayment(input); }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default { services: [MercadoPagoProvider] };