'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Check, ArrowRight, Rocket } from 'lucide-react';

type Step = {
  key: string;
  title: string;
  text: string;
  href: string;
  actionLabel: string;
  done: boolean;
};

// Checklist de arranque para un negocio (tenant) nuevo: se muestra mientras
// falten los 3 pasos imprescindibles para vender y facturar de verdad, y
// desaparece solo apenas están todos hechos. Cada paso se verifica contra
// datos reales, no contra un flag de "onboarding completado" - así nunca
// queda desactualizado si alguien borra el logo o desactiva ARCA después.
export default function OnboardingChecklist() {
  const { tenant } = useParams<{ tenant: string }>();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [tenantRes, arcaRes, productsRes] = await Promise.all([
          api.get('/tenant/me').catch(() => null),
          api.get('/arca-config').catch(() => null),
          api.get('/products', { params: { page: 1, limit: 1 } }).catch(() => null),
        ]);

        if (cancelled) return;

        const tenantInfo = tenantRes?.data?.tenant;
        const arcaConfig = arcaRes?.data?.content;
        const productTotal = productsRes?.data?.total ?? 0;

        setSteps([
          {
            key: 'empresa',
            title: 'Completá los datos de tu negocio',
            text: 'Razón social y CUIT: se imprimen en tickets, facturas y remitos.',
            href: `/${tenant}/configuracion/empresa`,
            actionLabel: 'completar datos',
            done: Boolean(tenantInfo?.ticketBusinessName && tenantInfo?.ticketCuit),
          },
          {
            key: 'arca',
            title: 'Configurá la facturación AFIP/ARCA',
            text: 'Certificado y punto de venta. Sin esto no se pueden emitir facturas.',
            href: `/${tenant}/configuracion/arca`,
            actionLabel: 'configurar AFIP',
            done: Boolean(arcaConfig?.isActive),
          },
          {
            key: 'productos',
            title: 'Cargá tus primeros productos',
            text: 'Con al menos uno ya podés hacer tu primera venta en el POS.',
            href: `/${tenant}/productos`,
            actionLabel: 'cargar productos',
            done: productTotal > 0,
          },
        ]);
      } catch {
        if (!cancelled) setSteps(null);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tenant, isAdmin]);

  if (!isAdmin || !steps || steps.every((s) => s.done)) return null;

  return (
    <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <Rocket size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Para arrancar</span>
      </div>

      <div>
        {steps.map((step, idx) => (
          <div
            key={step.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px',
              borderBottom: idx < steps.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${step.done ? 'var(--success)' : 'var(--border2)'}`,
              background: step.done ? 'var(--success)' : 'transparent',
            }}>
              {step.done && <Check size={13} style={{ color: '#fff' }} />}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text)',
                textDecoration: step.done ? 'line-through' : 'none',
                opacity: step.done ? 0.55 : 1,
              }}>
                {step.title}
              </div>
              {!step.done && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{step.text}</div>
              )}
            </div>

            {!step.done && (
              <Link href={step.href} className="btn btn-secondary btn-sm" style={{ gap: 5, flexShrink: 0 }}>
                {step.actionLabel} <ArrowRight size={12} />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
