import { Metadata } from "next"
import { Inter, Poppins } from "next/font/google" // Importamos las fuentes
import "styles/globals.css"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://localhost:8000"

// Configuramos Inter
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

// Configuramos Poppins
const poppins = Poppins({
  weight: ["400", "500", "600", "700"], // Pesos que vas a usar
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    // Inyectamos las variables CSS en el HTML
    <html lang="en" data-mode="light" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}