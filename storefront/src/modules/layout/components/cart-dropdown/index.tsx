"use client"

import { Popover, Transition } from "@headlessui/react"
import { Fragment } from "react"
import { usePathname } from "next/navigation"

import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"

// Componente para mostrar cada ítem individualmente
const Item = ({ item, region, countryCode }: { item: any, region: any, countryCode: string }) => {
  return (
    <div className="grid grid-cols-[60px_1fr] gap-x-4 mb-4" data-testid="cart-item">
      {/* IMAGEN DEL PRODUCTO (Con Link) */}
      <LocalizedClientLink
        href={`/products/${item.variant?.product?.handle}`}
        className="w-[60px] h-[80px] bg-gray-100 rounded overflow-hidden relative"
      >
        <img
          src={item.thumbnail}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </LocalizedClientLink>

      <div className="flex flex-col justify-between text-sm">
        <div className="flex flex-col">
          {/* NOMBRE DEL PRODUCTO (Con Link) */}
          <LocalizedClientLink
            href={`/products/${item.variant?.product?.handle}`}
            className="font-semibold text-white hover:text-gray-300 transition-colors line-clamp-2"
          >
            {item.title}
          </LocalizedClientLink>
          
          {/* VARIANTE (Talle, Color, etc) */}
          <span className="text-gray-400 text-xs mt-1">
            {item.variant?.title}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-gray-300">
            Cant: {item.quantity}
          </span>
          <span className="text-white font-medium">
             {convertToLocale({
                amount: item.unit_price,
                currency_code: region.currency_code,
              })}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function CartDropdown({
  cart,
  countryCode,
}: {
  cart?: HttpTypes.StoreCart | null
  countryCode: string
}) {
  const pathname = usePathname()

  return (
    <div className="h-full z-50" onMouseEnter={() => {}} onMouseLeave={() => {}}>
      <Popover className="relative h-full">
        <Popover.Button className="h-full flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none">
          <span className="text-white font-[Inter,sans-serif] uppercase text-sm tracking-widest">
            Cart ({cart?.items?.length || 0})
          </span>
        </Popover.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <Popover.Panel className="absolute top-full right-0 mt-2 w-80 origin-top-right bg-[#111111] border border-gray-800 p-4 shadow-xl rounded-lg z-50 max-h-[80vh] overflow-y-auto">
            {cart && cart.items?.length > 0 ? (
              <>
                <div className="flex flex-col gap-y-2 mb-4">
                  {cart.items.map((item) => (
                    <Item
                      key={item.id}
                      item={item}
                      region={cart.region}
                      countryCode={countryCode}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-y-4 text-sm border-t border-gray-800 pt-4">
                  <div className="flex items-center justify-between text-white font-semibold">
                    <span>Subtotal</span>
                    <span>
                      {convertToLocale({
                        amount: cart.subtotal || 0,
                        currency_code: cart.region?.currency_code,
                      })}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href="/cart"
                    className="w-full bg-[#00FFFF] text-black font-bold text-center py-3 rounded-full hover:opacity-90 transition-opacity uppercase tracking-wider text-xs"
                  >
                    Ir al Carrito
                  </LocalizedClientLink>
                </div>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center">
                <p className="text-gray-400 text-sm">Tu carrito está vacío.</p>
              </div>
            )}
          </Popover.Panel>
        </Transition>
      </Popover>
    </div>
  )
}