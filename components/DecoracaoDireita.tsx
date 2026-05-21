import Image from 'next/image'
import { assetPath } from '@/lib/asset-path'

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
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '20%', zIndex: 2,
          background: 'linear-gradient(to bottom, #0d0814 0%, transparent 100%)',
        }} />

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '28%', zIndex: 2,
          background: 'linear-gradient(to top, #0d0814 0%, transparent 100%)',
        }} />

        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: '45%', zIndex: 2,
          background: 'linear-gradient(to right, #0d0814 0%, transparent 100%)',
        }} />

        <Image
          src={assetPath('/Debora.png')}
          alt="Dra. Roseane Debora"
          fill
          style={{
            objectFit: 'cover',
            objectPosition: 'center top',
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  )
}
