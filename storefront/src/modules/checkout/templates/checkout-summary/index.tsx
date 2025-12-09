import { Heading } from "@medusajs/ui"

import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import DiscountCode from "@modules/checkout/components/discount-code"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"

// --- NUEVO: Importamos el escuchador que creamos en el Paso 1 ---
// Asegúrate de que la ruta coincida con donde creaste el archivo.
// Si seguiste mis instrucciones, debería estar en ../../components/mercadopago-listener
import  MercadoPagoListener  from "../../components/mercadopago-listener" 

const CheckoutSummary = ({ cart }: { cart: any }) => {
  return (
    <div className="sticky top-0 flex flex-col-reverse small:flex-col gap-y-8 py-8 small:py-0 ">
      
      {/* --- NUEVO: Aquí colocamos el detector de pago --- */}
      {/* Es invisible a menos que el pago sea exitoso, no afecta tu diseño */}
      <MercadoPagoListener cart={cart} />
      {/* ----------------------------------------------- */}

      <div className="w-full bg-white flex flex-col">
        <Divider className="my-6 small:hidden" />
        <Heading
          level="h2"
          className="flex flex-row text-3xl-regular items-baseline"
        >
          In your Cart
        </Heading>
        <Divider className="my-6" />
        <CartTotals totals={cart} />
        <ItemsPreviewTemplate items={cart?.items} />
        <div className="my-6">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary
