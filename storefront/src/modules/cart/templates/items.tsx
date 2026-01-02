import { HttpTypes } from "@medusajs/types"
import { Table } from "@medusajs/ui"
import Item from "@modules/cart/components/item"

type ItemsTemplateProps = {
  items?: HttpTypes.StoreCartLineItem[]
}

const ItemsTemplate = ({ items }: ItemsTemplateProps) => {
  return (
    <div className="w-full">
      <div className="pb-4 border-b border-gray-800 mb-4">
        <h2 className="text-gray-400 font-[Inter,sans-serif] text-sm uppercase tracking-widest">
          Detalle de Compra
        </h2>
      </div>
      
      {/* Tabla simple sin componente Table complejo si causa problemas */}
      <div className="flex flex-col gap-y-8">
        {items && items.length > 0 ? (
          items
            .sort((a, b) => {
              return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
            })
            .map((item) => {
              return <Item key={item.id} item={item} />
            })
        ) : (
          <div className="py-10 text-center text-gray-500 font-[Inter,sans-serif]">
            No hay items en el carrito.
          </div>
        )}
      </div>
    </div>
  )
}

export default ItemsTemplate