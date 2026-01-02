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
    // IMPORTANTE: min-h-screen y bg-[#101010] para toda la página
    <div className="py-20 bg-[#101010] min-h-screen text-white w-full">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
            
            {/* Columna Izquierda: Items */}
            <div className="flex flex-col gap-y-6">
              {!customer && (
                <>
                  <SignInPrompt />
                  <Divider className="border-gray-800" />
                </>
              )}
              <ItemsTemplate items={cart?.items} />
            </div>
            
            {/* Columna Derecha: Resumen */}
            <div className="relative">
              <div className="flex flex-col gap-y-8 sticky top-24">
                {cart && cart.region && (
                  <Summary cart={cart as any} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center items-center h-[50vh]">
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate