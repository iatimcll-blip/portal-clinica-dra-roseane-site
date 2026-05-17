'use client'

import { useEffect, useRef, useState } from 'react'

type PdfPageViewerProps = {
  page: number
  title: string
  url: string
  onPageCount?: (pages: number) => void
}

export default function PdfPageViewer({ page, title, url, onPageCount }: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    async function renderizar() {
      setCarregando(true)
      setErro('')

      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

        const documento = await pdfjs.getDocument({ url }).promise
        if (cancelado) return

        onPageCount?.(documento.numPages)
        const paginaSegura = Math.min(Math.max(page, 1), documento.numPages)
        const paginaPdf = await documento.getPage(paginaSegura)
        if (cancelado) return

        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        const viewportBase = paginaPdf.getViewport({ scale: 1 })
        const larguraDisponivel = Math.max(280, container.clientWidth - 24)
        const escala = Math.min(larguraDisponivel / viewportBase.width, 2)
        const viewport = paginaPdf.getViewport({ scale: escala })
        const ratio = window.devicePixelRatio || 1
        const context = canvas.getContext('2d')

        if (!context) throw new Error('Canvas indisponivel')

        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, viewport.width, viewport.height)

        renderTask = paginaPdf.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise

        if (!cancelado) setCarregando(false)
      } catch (error) {
        if (cancelado) return
        setErro(error instanceof Error ? error.message : 'Nao foi possivel renderizar o PDF.')
        setCarregando(false)
      }
    }

    renderizar()

    return () => {
      cancelado = true
      renderTask?.cancel()
    }
  }, [onPageCount, page, url])

  return (
    <div ref={containerRef} className="material-canvas-shell">
      {carregando && <div className="material-canvas-status">Carregando página...</div>}
      {erro && <div className="material-canvas-error">Não foi possível exibir o PDF nesta tela.</div>}
      <canvas ref={canvasRef} aria-label={`${title} - pagina ${page}`} className="material-canvas" />
    </div>
  )
}
