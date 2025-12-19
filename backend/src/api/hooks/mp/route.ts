import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";

// HE ELIMINADO LA IMPORTACIÓN DEL WORKFLOW PARA QUE NO DE ERROR
// Una vez que el webhook funcione, buscaremos el workflow correcto.

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // SOLUCIÓN ERRORES 2 y 3:
    // Forzamos a TypeScript a tratar el body como "cualquier cosa" (any)
    const eventData = req.body as any;
    
    const type = eventData.type;
    const data = eventData.data;

    // Solo nos interesa si es un pago
    if (type !== "payment") {
       // Respondemos OK para que MP deje de insistir con eventos que no son pagos
       res.status(200).send("Ignored");
       return; 
    }

    const id = data?.id;

    if (!id) {
       res.status(400).send("No ID found");
       return;
    }

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    
    // Imprimimos en consola para confirmar que llega
    logger.info(`✅ ÉXITO: Recibido webhook de Mercado Pago. Payment ID: ${id}`);

    // AQUÍ IRÁ LA LÓGICA DE ACTUALIZAR EL PAGO MÁS ADELANTE
    // Por ahora solo queremos ver el mensaje de éxito en la consola.

    res.status(200).send("OK");

  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(`Error en Webhook MP: ${error}`);
    res.status(500).send("Internal Server Error");
  }
}