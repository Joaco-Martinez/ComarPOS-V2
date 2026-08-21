'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { CheckCircle2, CreditCard, Eye, EyeOff, Rocket } from 'lucide-react';

const emptyForm = {
  businessName: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  phone: '',
};

const PERKS = [
  '7 días gratis, sin tarjeta',
  'Facturación AFIP real desde el minuto uno',
  'Tus datos quedan guardados si después seguís con nosotros',
];

type Mode = 'trial' | 'direct';
type Plan = { name: string; priceArs: number; currency: string; tagline: string };

export default function PruebaGratisPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [mode, setMode] = useState<Mode>('trial');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initialMode = new URLSearchParams(window.location.search).get('plan') === 'directo' ? 'direct' : 'trial';
      setMode(initialMode);
    }
    api.get('/billing/plan').then(({ data }) => setPlan(data.content ?? data)).catch(() => {});
  }, []);

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid =
    form.businessName.trim() &&
    form.adminName.trim() &&
    form.adminEmail.trim() &&
    form.phone.trim() &&
    form.adminPassword.trim().length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;

    setLoading(true);
    setError('');

    try {
      await api.post('/trial-signup', form);

      const { data } = await api.post('/auth/login', {
        email: form.adminEmail.trim().toLowerCase(),
        password: form.adminPassword,
      });
      const user = data.content ?? data;
      setUser(user);

      if (mode === 'trial') {
        router.replace(`/${user.tenantSlug}/pos`);
        return;
      }

      // Modo "suscribirme ahora": la cuenta ya existe, generamos el checkout
      // de Mercado Pago y mandamos directo ahí. Si falla (ej: MP todavía no
      // está configurado), la cuenta igual quedó creada - mandamos a
      // /suscripcion para que pueda reintentar el pago desde ahí.
      try {
        const { data: checkoutData } = await api.post('/billing/checkout');
        const initPoint = (checkoutData.content ?? checkoutData)?.initPoint;
        if (!initPoint) throw new Error('sin link de pago');
        window.location.href = initPoint;
      } catch {
        router.replace('/suscripcion');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos crear tu cuenta. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const priceLabel = plan ? `$${plan.priceArs.toLocaleString('es-AR')}/mes` : '$35.000/mes';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 900, display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <img src="/brand/logo-horizontal-positivo.svg" alt="ComarPOS" style={{ height: 30, marginBottom: 24 }} className="brand-logo-light" />
          <img src="/brand/logo-horizontal-negativo.svg" alt="ComarPOS" style={{ height: 30, marginBottom: 24 }} className="brand-logo-dark" />
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            {mode === 'trial' ? 'Probá ComarPOS gratis durante 7 días' : 'Suscribite a ComarPOS'}
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24, maxWidth: 380 }}>
            {mode === 'trial'
              ? 'Creá tu cuenta ahora y entrás directo al sistema con tu propio negocio ya configurado. No hace falta tarjeta de crédito.'
              : `Creá tu cuenta y pagá tu suscripción con Mercado Pago (${priceLabel}, precio de lanzamiento por tiempo limitado). Arrancás a usar el sistema apenas se acredite.`}
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(mode === 'trial'
              ? PERKS
              : [`${plan?.name ?? 'Plan ComarPOS'} - ${priceLabel}`, 'Precio de lanzamiento fijo de por vida, por tiempo limitado', 'Facturación AFIP real desde el minuto uno']
            ).map((p) => (
              <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text3)' }}>
                <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0 }} /> {p}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: '1 1 380px', maxWidth: 420 }}>
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'var(--surface2)', borderRadius: 8, padding: 4 }}>
              <button
                type="button"
                onClick={() => setMode('trial')}
                className={mode === 'trial' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Prueba gratis 7 días
              </button>
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={mode === 'direct' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Suscribirme ahora
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {mode === 'trial' ? (
                <Rocket size={16} style={{ color: 'var(--accent)' }} />
              ) : (
                <CreditCard size={16} style={{ color: 'var(--accent)' }} />
              )}
              <h2 style={{ fontSize: 16, fontWeight: 800 }}>
                {mode === 'trial' ? 'Empezá tu prueba gratis' : `Suscribite - ${priceLabel}`}
              </h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              Completá estos datos, tardás menos de un minuto
            </p>

            {error && (
              <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '9px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre de tu negocio *</label>
                <input value={form.businessName} onChange={f('businessName')} placeholder="Ej: Almacén Don José" autoFocus disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">Tu nombre *</label>
                <input value={form.adminName} onChange={f('adminName')} placeholder="Ej: José Pérez" disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" value={form.adminEmail} onChange={f('adminEmail')} placeholder="vos@tunegocio.com" disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono *</label>
                <input value={form.phone} onChange={f('phone')} placeholder="Ej: 351 123 4567" disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.adminPassword}
                    onChange={f('adminPassword')}
                    placeholder="Mínimo 6 caracteres"
                    disabled={loading}
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    disabled={loading}
                    style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 6, gap: 8 }} disabled={!valid || loading}>
                {loading ? (
                  <span className="spinner" style={{ width: 15, height: 15 }} />
                ) : mode === 'trial' ? (
                  'Crear mi cuenta gratis'
                ) : (
                  <>
                    <CreditCard size={15} /> Crear cuenta y pagar con Mercado Pago
                  </>
                )}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 18 }}>
              ¿Ya tenés cuenta? <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Iniciar sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
