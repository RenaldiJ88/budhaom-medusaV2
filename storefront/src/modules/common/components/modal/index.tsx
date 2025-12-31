"use client"

import { clx } from "@medusajs/ui"
import React from "react"

import { ModalProvider, useModal } from "@lib/context/modal-context"
import X from "@modules/common/icons/x"

// ELIMINAMOS @headlessui/react

type ModalProps = {
  isOpen: boolean
  close: () => void
  size?: "small" | "medium" | "large"
  search?: boolean
  children: React.ReactNode
  'data-testid'?: string
}

const Modal = ({
  isOpen,
  close,
  size = "medium",
  search = false,
  children,
  'data-testid': dataTestId
}: ModalProps) => {
  
  // SI NO ESTÁ ABIERTO, NO RENDERIZAMOS NADA (CERO RIESGO)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[75] isolate">
      {/* Backdrop oscuro */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={close} // Cierra al hacer click afuera
      />

      <div className="fixed inset-0 overflow-y-auto">
        <div
          className={clx(
            "flex min-h-full h-full justify-center p-4 text-center",
            {
              "items-center": !search,
              "items-start": search,
            }
          )}
        >
            <div
                data-testid={dataTestId}
                className={clx(
                  "relative transform text-left align-middle transition-all w-full h-fit flex flex-col",
                  {
                    "max-w-md": size === "small",
                    "max-w-xl": size === "medium",
                    "max-w-3xl": size === "large",
                    "bg-transparent shadow-none": search,
                    "bg-white shadow-xl border rounded-rounded p-5": !search,
                  }
                )}
            >
                <ModalProvider close={close}>{children}</ModalProvider>
            </div>
        </div>
      </div>
    </div>
  )
}

const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { close } = useModal()

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-large-semi font-bold">{children}</div>
      <div>
        <button onClick={close} data-testid="close-modal-button" className="text-gray-500 hover:text-black">
          <X size={20} />
        </button>
      </div>
    </div>
  )
}

const Description: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex text-small-regular text-ui-fg-base items-center justify-center pt-2 pb-4 h-full">
      {children}
    </div>
  )
}

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="flex justify-center w-full">{children}</div>
}

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="flex items-center justify-end gap-x-4 mt-4 pt-4 border-t">{children}</div>
}

Modal.Title = Title
Modal.Description = Description
Modal.Body = Body
Modal.Footer = Footer

export default Modal