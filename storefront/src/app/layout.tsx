import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
// 1. Agregamos la importación de fuentes de Google
import { Inter, Poppins } from "next/font/google" 
import "styles/globals.css"

// 2. Configuramos la fuente Inter (Cuerpo de texto)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

// 3. Configuramos la fuente Poppins (Títulos)
const poppins = Poppins({
  weight: ["400", "600", "700"], // Pesos: Regular, SemiBold, Bold
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    // 4. Inyectamos las variables de las fuentes en el HTML
    <html lang="en" data-mode="light" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}