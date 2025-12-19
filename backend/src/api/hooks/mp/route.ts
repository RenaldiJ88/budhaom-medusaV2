import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";
import { MercadoPagoConfig, Payment } from 'mercadopago';
// Importamos el Workflow oficial para completar carritos
import { completeCartWorkflow } from "@medusajs/medusa/core-flows";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const eventData = req.body as any;
    const type = eventData.type;
    const data = eventData.data;

    if (type !== "payment") {
       res.status(200).send("Ignored");
       return; 
    }

    const id = data?.id;
    if (!id) {
       res.status(400).send("No ID found");
       return;
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        logger.error("❌ ERROR: Falta MP_ACCESS_TOKEN");
        res.status(500).send("Config Error");
        return;
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: id });
    
    const status = paymentInfo.status;
    const externalReference = paymentInfo.external_reference; // Esto es 'payses_...'

    logger.info(`🔍 ID: ${id} | Estado: ${status} | Ref: ${externalReference}`);

    if (status === 'approved' && externalReference) {
        
        // 1. BUSCAR EL CART ID USANDO LA REFERENCIA DE PAGO
        // En Medusa v2 usamos 'QUERY' para buscar datos relacionales
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        
        // Buscamos un carrito que esté asociado a esta sesión de pago
        const { data: carts } = await query.graph({
            entity: "cart",
            fields: ["id"],
            filters: {
                payment_collection: {
                    payment_sessions: {
                        id: externalReference
                    }
                }
            }
        });

        const cartId = carts[0]?.id;

        if (cartId) {
            logger.info(`🛒 Cart ID encontrado: ${cartId}. Ejecutando Workflow...`);
            
            try {
                // 2. EJECUTAR EL WORKFLOW PARA CREAR LA ORDEN
                // Esto reemplaza al antiguo cartService.complete()
                const { result } = await completeCartWorkflow(req.scope)
                    .run({
                        input: { id: cartId }
                    });

                logger.info(`🎉 ¡ORDEN CREADA EXITOSAMENTE! ID: ${result.id}`);
            } catch (workflowError) {
                // Si falla es probable que ya se haya completado antes
                logger.error(`⚠️ Error en Workflow (posible duplicado): ${(workflowError as any).message}`);
            }
        } else {
            logger.error(`❌ No se encontró ningún Carrito asociado a la sesión ${externalReference}`);
        }
    }

    res.status(200).send("OK");

  } catch (error) {
    logger.error(`Error Webhook: ${(error as any).message}`);
    res.status(200).send("Error processed"); 
  }
}