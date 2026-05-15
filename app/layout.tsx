import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Painel | Clínica Dra. Roseane Débora',
  description: 'Painel de Acompanhamento de Metas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full gradient-bg">{children}</body>
    </html>
  )
}
