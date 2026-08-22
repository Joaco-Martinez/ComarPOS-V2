'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import {
  Building2, ShieldCheck, Tags, Package, Warehouse, Users, Smartphone, ShoppingCart,
  Check, ExternalLink,
} from 'lucide-react';

type StepId = 'empresa' | 'arca' | 'categorias' | 'productos' | 'sucursales' | 'usuarios' | 'pwa' | 'primera-venta';

type Step = {
  id: StepId;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  desc: string;
  href: string;
  linkLabel: string;
};

const STEPS: Step[] = [
  {
    id: 'empresa', icon: Building2, title: 'Completá los datos de tu empresa',
    desc: 'Nombre, CUIT, dirección y teléfono — aparecen en tus tickets y facturas.',
    href: '/configuracion/empresa', linkLabel: 'Ir a Empresa',
  },
  {
    id: 'arca', icon: ShieldCheck, title: 'Configurá ARCA/AFIP',
    desc: 'Cargá tus certificados y punto de venta para poder facturar con CAE de verdad.',
    href: '/configuracion/arca', linkLabel: 'Ir a ARCA / AFIP',
  },
  {
    id: 'categorias', icon: Tags, title: 'Creá tus categorías de productos',
    desc: 'Organizá tu catálogo antes de cargar productos (podés sumar más después).',
    href: '/categorias', linkLabel: 'Ir a Categorías',
  },
  {
    id: 'productos', icon: Package, title: 'Cargá tus primeros productos',
    desc: 'Nombre, precio, stock inicial. No hace falta cargar todo el catálogo de una.',
    href: '/productos', linkLabel: 'Ir a Productos',
  },
  {
    id: 'sucursales', icon: Warehouse, title: 'Agregá tus sucursales o depósitos',
    desc: 'Si tenés más de un local o depósito, cargalos para manejar stock por separado.',
    href: '/configuracion/business-locations', linkLabel: 'Ir a Sucursales',
  },
  {
    id: 'usuarios', icon: Users, title: 'Creá usuarios para tus empleados',
    desc: 'Cada persona que venda debería tener su propio usuario, no compartir uno.',
    href: '/usuarios', linkLabel: 'Ir a Usuarios',
  },
  {
    id: 'pwa', icon: Smartphone, title: 'Instalá la app en el celular',
    desc: 'Agregala a la pantalla de inicio para abrirla como una app, sin pasar por el navegador.',
    href: '/instalar', linkLabel: 'Ver instrucciones',
  },
  {
    id: 'primera-venta', icon: ShoppingCart, title: 'Hacé tu primera venta de prueba',
    desc: 'Probá el punto de venta con un producto cargado, de punta a punta.',
    href: '/pos', linkLabel: 'Ir al POS',
  },
];

export default function GuiaPage() {
  const params = useParams<{ tenant: string }>();
  const tenantSlug = params?.tenant ?? '';
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/onboarding')
      .then(({ data }) => setChecklist(data ?? {}))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (stepId: StepId) => {
    const done = !checklist[stepId];
    setChecklist((prev) => ({ ...prev, [stepId]: done }));
    try {
      await api.patch(`/onboarding/${stepId}`, { done });
    } catch {
      setChecklist((prev) => ({ ...prev, [stepId]: !done }));
    }
  };

  const completedCount = STEPS.filter((s) => checklist[s.id]).length;
  const allDone = completedCount === STEPS.length;

  return (
    <AppLayout title="Guía de arranque" subtitle={`${completedCount} de ${STEPS.length} pasos completados`}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(completedCount / STEPS.length) * 100}%`,
                background: allDone ? 'var(--success)' : 'var(--m-gradient, var(--accent))',
                borderRadius: 999, transition: 'width 0.3s ease',
              }} />
            </div>
            {allDone && (
              <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 8, fontWeight: 600 }}>
                ¡Listo! Ya completaste todos los pasos para arrancar.
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map((step, i) => {
              const done = Boolean(checklist[step.id]);
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className="card"
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16,
                    opacity: done ? 0.65 : 1, transition: 'opacity 0.2s ease',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(step.id)}
                    aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecho'}
                    style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 2,
                      border: `2px solid ${done ? 'var(--success)' : 'var(--border2)'}`,
                      background: done ? 'var(--success)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    {done && <Check size={15} color="#fff" strokeWidth={3} />}
                  </button>

                  <div style={{
                    width: 34, height: 34, borderRadius: 10, background: 'var(--accent-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={17} style={{ color: 'var(--accent)' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: 'var(--text)',
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {i + 1}. {step.title}
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>
                      {step.desc}
                    </p>
                    <a
                      href={`/${tenantSlug}${step.href}`}
                      className="btn btn-ghost btn-xs"
                      style={{ marginTop: 8, padding: '3px 0', color: 'var(--accent)', gap: 4 }}
                    >
                      {step.linkLabel} <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
