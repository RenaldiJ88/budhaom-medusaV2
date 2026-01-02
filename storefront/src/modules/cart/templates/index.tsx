import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import Divider from "@modules/common/components/divider"
import { HttpTypes } from "@medusajs/types"

const CartTemplate = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  return (
    // CAMBIO: Fondo negro general
    <div className="py-12 bg-[#101010] min-h-screen text-white">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 small:grid-cols-[1fr_360px] gap-x-40">
            {/* Columna Izquierda: Items (Fondo Negro Explícito) */}
            <div className="flex flex-col bg-[#101010] py-6 gap-y-6">
              {!customer && (
                <>
                  <SignInPrompt />
                  <Divider className="bg-gray-800" />
                </>
              )}
              {/* Le pasamos solo items, ya que quitamos region antes para evitar errores */}
              <ItemsTemplate items={cart?.items} />
            </div>
            
            {/* Columna Derecha: Resumen */}
            <div className="relative">
              <div className="flex flex-col gap-y-8 sticky top-12">
                {cart && cart.region && (
                  <>
                    <div className="bg-[#101010] py-6">
                      <Summary cart={cart as any} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate