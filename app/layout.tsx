import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Painel | Clínica Dra. Roseane Débora',
  description: 'Painel de Acompanhamento de Metas',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full gradient-bg">{children}</body>
    </html>
  )
}
