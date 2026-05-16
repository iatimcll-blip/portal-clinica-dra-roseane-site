import Image from 'next/image'

export default function DecoracaoDireita() {
  return (
    <div className="decoracao-direita" style={{
      width: 260,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflow: 'hidden',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {/* Gradiente superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '20%', zIndex: 2,
        background: 'linear-gradient(to bottom, #0d0814 0%, transparent 100%)',
      }} />

      {/* Gradiente inferior */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '28%', zIndex: 2,
        background: 'linear-gradient(to top, #0d0814 0%, transparent 100%)',
      }} />

      {/* Gradiente lateral esquerda */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0,
        width: '45%', zIndex: 2,
        background: 'linear-gradient(to right, #0d0814 0%, transparent 100%)',
      }} />

      {/* Foto */}
      <Image
        src="/Debora.png"
        alt="Dra. Roseane Débora"
        fill
        style={{
          objectFit: 'cover',
          objectPosition: 'center top',
          opacity: 0.6,
        }}
      />
    </div>
  )
}
