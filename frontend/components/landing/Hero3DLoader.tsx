'use client';

import dynamic from 'next/dynamic';

// WebGL solo puede correr en el cliente: se carga dinámicamente sin SSR y con
// un fallback simple mientras se descarga el bundle de three.js.
const Hero3D = dynamic(() => import('./Hero3D'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  ),
});

export default function Hero3DLoader() {
  return (
    <div style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <Hero3D />
    </div>
  );
}
