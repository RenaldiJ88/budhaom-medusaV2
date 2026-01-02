import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Table } from "@medusajs/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsTemplateProps = {
  items?: HttpTypes.StoreCartLineItem[]
}

const ItemsTemplate = ({ items }: ItemsTemplateProps) => {
  return (
    <div>
      <div className="pb-3 flex items-center border-b border-gray-800 mb-4">
        {/* Título de la sección de items */}
        <h2 className="text-gray-400 font-[Inter,sans-serif] text-sm uppercase tracking-widest">
          Detalle de Compra
        </h2>
      </div>
      
      <Table className="bg-transparent">
        <Table.Header className="border-t-0 border-b border-gray-800">
          <Table.Row className="text-white hover:bg-transparent bg-transparent txt-medium-plus border-b-0">
            <Table.HeaderCell className="!pl-0 text-gray-400 font-normal">Item</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell className="text-gray-400 font-normal">Quantity</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell text-gray-400 font-normal">
              Price
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right text-gray-400 font-normal">
              Total
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body className="border-t-0 border-b-0">
          {items
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                })
                .map((item) => {
                  return <Item key={item.id} item={item} />
                })
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />
              })}
        </Table.Body>
      </Table>
    </div>
  )
}

export default ItemsTemplate