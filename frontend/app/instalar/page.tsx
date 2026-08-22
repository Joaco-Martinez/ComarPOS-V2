'use client';

import { useEffect, useState } from 'react';
import { Share, Menu, Plus, CheckCircle2, Smartphone } from 'lucide-react';

type OS = 'ios' | 'android';

const IOS_STEPS = [
  { icon: Share, text: <>Tocá el ícono de <b>Compartir</b> (el cuadrado con la flecha hacia arriba) en la barra de abajo de Safari.</> },
  { icon: Plus, text: <>Deslizá y elegí <b>&ldquo;Agregar a Inicio&rdquo;</b>.</> },
  { icon: CheckCircle2, text: <>Confirmá tocando <b>&ldquo;Agregar&rdquo;</b> arriba a la derecha, sin tocar el nombre ni el link.</> },
];

const ANDROID_STEPS = [
  { icon: Menu, text: <>Tocá el menú de <b>tres puntos</b> (⋮) arriba a la derecha de Chrome.</> },
  { icon: Plus, text: <>Elegí <b>&ldquo;Instalar app&rdquo;</b> o <b>&ldquo;Agregar a pantalla principal&rdquo;</b> (el texto varía según la versión).</> },
  { icon: CheckCircle2, text: <>Confirmá tocando <b>&ldquo;Instalar&rdquo;</b>.</> },
];

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'ios';
  return /android/i.test(navigator.userAgent) ? 'android' : 'ios';
}

export default function InstallGuidePage() {
  const [os, setOs] = useState<OS>('ios');

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const steps = os === 'ios' ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: '32px 20px 60px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/brand/isologo.png" alt="ComarPOS" width={64} height={64} style={{ margin: '0 auto 14px', display: 'block', objectFit: 'contain' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Instalar ComarPOS</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text3)' }}>
            Agregalo a la pantalla de inicio de tu celular para abrirlo como una app, directo al punto de venta.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, background: 'var(--surface2)', borderRadius: 12, padding: 4, marginBottom: 24 }}>
          <button
            onClick={() => setOs('ios')}
            className={`btn btn-sm ${os === 'ios' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
          >
            iPhone
          </button>
          <button
            onClick={() => setOs('android')}
            className={`btn btn-sm ${os === 'android' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1 }}
          >
            Android
          </button>
        </div>

        {os === 'ios' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text3)', marginBottom: 18, background: 'var(--accent-dim)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px' }}>
            <Smartphone size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>Tiene que ser desde <b style={{ color: 'var(--text)' }}>Safari</b> — Chrome en iPhone no permite instalar la app.</span>
          </div>
        )}

        <div className="card" style={{ padding: 4 }}>
          {steps.map(({ icon: Icon, text }, i) => (
            <div
              key={i}
              style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 14px',
                borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, paddingTop: 3 }}>
                <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>{text}</p>
              </div>
              <Icon size={17} style={{ color: 'var(--text3)', flexShrink: 0, marginTop: 6 }} />
            </div>
          ))}
        </div>

        <a
          href="/app"
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}
        >
          Abrir ComarPOS ahora
        </a>
        <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
          Tocá este botón primero y hacé los pasos de arriba desde esta pantalla, así el ícono queda bien configurado.
        </p>
      </div>
    </div>
  );
}
