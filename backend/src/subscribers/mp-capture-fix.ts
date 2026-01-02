import { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { ContainerRegistrationKeys } from '@medusajs/utils'

export default async function mpCaptureFixHandler({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  
  const orderId = data.id
  
  if (!orderId) {
    logger.warn(`⚠️ [MP-SUBSCRIBER] order.placed recibido sin order_id`)
    return
  }
  
  logger.info(`🔍 [MP-SUBSCRIBER] Orden creada detectada. ID: ${orderId}. Sincronizando estado de pago...`)
  
  try {
    const { Client } = require('pg')
    
    if (!process.env.DATABASE_URL) {
      logger.error(`❌ [MP-SUBSCRIBER] DATABASE_URL no disponible. No se puede sincronizar.`)
      return
    }
    
    const client = new Client({ 
      connectionString: process.env.DATABASE_URL, 
      ssl: { rejectUnauthorized: false } 
    })
    
    await client.connect()
    
    try {
      // PASO 1: Buscar payment_collection asociada a esta orden
      let paymentCollectionId: string | null = null
      
      // ESTRATEGIA 1: Buscar por payment_collection_id directo en order
      const orderCollectionQuery = await client.query(
        `SELECT payment_collection_id FROM "order" WHERE id = $1 LIMIT 1`,
        [orderId]
      )
      
      if (orderCollectionQuery.rows.length > 0 && orderCollectionQuery.rows[0].payment_collection_id) {
        paymentCollectionId = orderCollectionQuery.rows[0].payment_collection_id
        logger.info(`✅ [MP-SUBSCRIBER] Payment Collection encontrada por order.payment_collection_id: ${paymentCollectionId}`)
      } else {
        // ESTRATEGIA 2: Buscar vía cart_id (order -> cart -> payment_collection)
        const cartCollectionQuery = await client.query(
          `SELECT pc.id as payment_collection_id
           FROM payment_collection pc
           INNER JOIN "order" o ON o.cart_id = pc.cart_id
           WHERE o.id = $1
           LIMIT 1`,
          [orderId]
        )
        
        if (cartCollectionQuery.rows.length > 0) {
          paymentCollectionId = cartCollectionQuery.rows[0].payment_collection_id
          logger.info(`✅ [MP-SUBSCRIBER] Payment Collection encontrada vía cart_id: ${paymentCollectionId}`)
        }
      }
      
      if (!paymentCollectionId) {
        logger.warn(`⚠️ [MP-SUBSCRIBER] No se encontró payment_collection para orden ${orderId}. Puede ser normal si no hay pago asociado.`)
        return
      }
      
      // PASO 2: Buscar payment capturado asociado a esta collection
      const capturedPaymentQuery = await client.query(
        `SELECT 
            id,
            amount,
            captured_at,
            data->>'mp_payment_id' as mp_payment_id
         FROM payment 
         WHERE payment_collection_id = $1 
           AND captured_at IS NOT NULL
         ORDER BY captured_at DESC
         LIMIT 1`,
        [paymentCollectionId]
      )
      
      if (capturedPaymentQuery.rows.length === 0) {
        logger.info(`ℹ️ [MP-SUBSCRIBER] No hay payment capturado para orden ${orderId}. Estado pendiente es correcto.`)
        return
      }
      
      const capturedPayment = capturedPaymentQuery.rows[0]
      const paidAmount = parseFloat(capturedPayment.amount) || 0
      
      logger.info(`🔍 [MP-SUBSCRIBER] Payment capturado encontrado. Monto: ${paidAmount}, MP ID: ${capturedPayment.mp_payment_id}`)
      
      // PASO 3: Calcular total capturado de todos los payments de esta collection
      const totalCapturedQuery = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total_captured 
         FROM payment 
         WHERE payment_collection_id = $1 AND captured_at IS NOT NULL`,
        [paymentCollectionId]
      )
      
      const totalCaptured = parseFloat(totalCapturedQuery.rows[0].total_captured) || 0
      
      logger.info(`🔧 [MP-SUBSCRIBER] Actualizando Orden ${orderId} con payment_status='captured' y paid_total=${totalCaptured}`)
      
      // PASO 4: Actualizar la orden con múltiples estrategias
      let updateSuccess = false
      
      // ESTRATEGIA A: Actualizar payment_status si existe
      try {
        const updateStatusQuery = `
          UPDATE "order" 
          SET payment_status = 'captured',
              updated_at = NOW()
          WHERE id = $1
        `
        await client.query(updateStatusQuery, [orderId])
        logger.info(`✅ [MP-SUBSCRIBER] Order payment_status actualizado a 'captured'`)
        updateSuccess = true
      } catch (errStatus: any) {
        logger.warn(`⚠️ [MP-SUBSCRIBER] Campo payment_status no existe o error: ${errStatus.message}`)
      }
      
      // ESTRATEGIA B: Actualizar paid_total si existe
      try {
        const updatePaidQuery = `
          UPDATE "order" 
          SET paid_total = $1,
              updated_at = NOW()
          WHERE id = $2
        `
        await client.query(updatePaidQuery, [totalCaptured, orderId])
        logger.info(`✅ [MP-SUBSCRIBER] Order paid_total actualizado a: ${totalCaptured}`)
        updateSuccess = true
      } catch (errPaid: any) {
        logger.warn(`⚠️ [MP-SUBSCRIBER] Campo paid_total no existe o error: ${errPaid.message}`)
      }
      
      // ESTRATEGIA C: Actualizar data JSONB con información de captura
      try {
        const updateDataQuery = `
          UPDATE "order" 
          SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
              'payment_status', 'captured'::text,
              'paid_total', $1::numeric,
              'captured_at', NOW()::text,
              'mp_payment_id', $2::text
          ),
          updated_at = NOW()
          WHERE id = $3
        `
        await client.query(updateDataQuery, [totalCaptured, capturedPayment.mp_payment_id || '', orderId])
        logger.info(`✅ [MP-SUBSCRIBER] Order data actualizado con payment_status y paid_total`)
        updateSuccess = true
      } catch (errData: any) {
        logger.warn(`⚠️ [MP-SUBSCRIBER] Error actualizando data en order: ${errData.message}`)
      }
      
      // ESTRATEGIA D: Actualizar updated_at mínimo para forzar recálculo
      try {
        const updateTimestampQuery = `
          UPDATE "order" 
          SET updated_at = NOW()
          WHERE id = $1
        `
        await client.query(updateTimestampQuery, [orderId])
        logger.info(`✅ [MP-SUBSCRIBER] Order updated_at actualizado. Medusa recalculará estado.`)
        updateSuccess = true
      } catch (errTimestamp: any) {
        logger.warn(`⚠️ [MP-SUBSCRIBER] Error actualizando updated_at: ${errTimestamp.message}`)
      }
      
      if (updateSuccess) {
        logger.info(`✅ [MP-SUBSCRIBER] Orden ${orderId} corregida post-creación. Estado sincronizado con payment capturado.`)
      } else {
        logger.error(`❌ [MP-SUBSCRIBER] No se pudo actualizar ninguna columna en la orden ${orderId}`)
      }
      
    } finally {
      await client.end()
    }
    
  } catch (error: any) {
    logger.error(`🔥 [MP-SUBSCRIBER-ERROR] Error sincronizando orden ${orderId}: ${error.message}`)
    logger.error(`🔥 [MP-SUBSCRIBER-ERROR] Stack: ${error.stack}`)
    // No lanzamos el error para que no rompa el flujo de creación de orden
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed'
}