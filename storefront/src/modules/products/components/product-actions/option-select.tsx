import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const filteredOptions = option.values?.map((v) => v.value)

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm text-gray-400 font-[Inter,sans-serif] uppercase tracking-wide">
        Seleccionar {title}
      </span>
      <div
        className="flex flex-wrap gap-3"
        data-testid={dataTestId}
      >
        {filteredOptions?.map((v) => {
          return (
            <button
              onClick={() => updateOption(option.title ?? "", v ?? "")}
              key={v}
              className={clx(
                "h-12 min-w-[3rem] px-4 rounded border font-semibold text-sm transition-all duration-200 uppercase",
                {
                  // ESTILO SELECCIONADO: Cyan, texto negro
                  "border-[#00FFFF] bg-[#00FFFF] text-black shadow-[0_0_10px_rgba(0,255,255,0.4)]": v === current,
                  
                  // ESTILO NO SELECCIONADO: Fondo Negro, texto blanco
                  "border-gray-600 bg-[#1a1a1a] text-white hover:border-gray-400": v !== current,
                  
                  // ESTILO DESHABILITADO
                  "opacity-50 cursor-not-allowed bg-gray-800": disabled,
                }
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect