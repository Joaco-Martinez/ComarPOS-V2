import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'ComarPOS — Punto de venta, facturación AFIP, stock y caja en un solo sistema';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const logo = readFileSync(join(process.cwd(), 'public/brand/isologo.png')).toString('base64');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0C0F14',
          backgroundImage: 'radial-gradient(circle at 28% 22%, rgba(13,89,231,0.35), transparent 60%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${logo}`} width={84} height={84} alt="" />
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#fff', letterSpacing: -1.5 }}>
            omar<span style={{ color: '#0D59E7' }}>POS</span>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: '#B9C2D0', textAlign: 'center', maxWidth: 880, lineHeight: 1.4 }}>
          Punto de venta, facturación electrónica AFIP, stock y caja — todo en un solo sistema
        </div>
      </div>
    ),
    { ...size }
  );
}
