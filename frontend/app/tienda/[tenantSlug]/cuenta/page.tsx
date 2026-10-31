/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useStore } from '../StoreContext';
import { useAccount } from '../AccountContext';
import { User, Mail, Lock, Phone, IdCard, UserCircle2, LogOut } from 'lucide-react';

export default function TiendaCuentaPage() {
  const { store, tenantSlug } = useStore();
  const { account, refresh, logout } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || `/tienda/${tenantSlug}/checkout`;

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dni, setDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const goNext = async () => {
    await refresh();
    router.push(next);
  };

  const submitLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/login', { email: loginEmail.trim(), password: loginPassword });
      if (data?.content?.tenantSlug !== tenantSlug) {
        toast.error('Esa cuenta no pertenece a esta tienda');
        await api.post('/auth/logout').catch(() => undefined);
        return;
      }
      toast.success('Sesión iniciada');
      await goNext();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async () => {
    if (!nombre.trim() || !dni.trim() || !regEmail.trim() || regPassword.length < 6) return;
    setSubmitting(true);
    try {
      await api.post(`/tienda/${tenantSlug}/auth/register`, {
        nombre: nombre.trim(),
        apellido: apellido.trim() || undefined,
        dni: dni.trim(),
        telefono: telefono.trim() || undefined,
        email: regEmail.trim(),
        password: regPassword,
      });
      toast.success(`Cuenta creada, bienvenido/a a ${store.storeName}`);
      await goNext();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo crear la cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  if (account) {
    return (
      <div className="t-narrow" style={{ maxWidth: 420, textAlign: 'center', paddingTop: 16 }}>
        <UserCircle2 size={48} style={{ color: 'var(--store-accent)', marginBottom: 10 }} />
        <h2 className="t-h2" style={{ marginBottom: 4 }}>{account.name}</h2>
        <p className="t-muted" style={{ marginBottom: 24 }}>{account.email}</p>
        <div className="t-stack">
          <Link href={`/tienda/${tenantSlug}/productos`} className="t-btn">Ver productos</Link>
          <button onClick={async () => { await logout(); }} className="t-btn t-btn-outline" style={{ color: '#F04438' }}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="t-narrow" style={{ maxWidth: 420 }}>
      <h2 className="t-h2" style={{ marginBottom: 6, textAlign: 'center' }}>
        {tab === 'login' ? 'Ingresá a tu cuenta' : `Creá tu cuenta en ${store.storeName}`}
      </h2>
      <p className="t-muted" style={{ marginBottom: 20, textAlign: 'center' }}>
        Con tu cuenta tus datos quedan guardados para la próxima compra. También podés comprar sin cuenta.
      </p>

      <div className="t-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'login'} onClick={() => setTab('login')} className={`t-tab${tab === 'login' ? ' is-active' : ''}`}>
          Ya tengo cuenta
        </button>
        <button role="tab" aria-selected={tab === 'register'} onClick={() => setTab('register')} className={`t-tab${tab === 'register' ? ' is-active' : ''}`}>
          Crear cuenta
        </button>
      </div>

      {tab === 'login' ? (
        <form className="t-stack" onSubmit={(e) => { e.preventDefault(); submitLogin(); }}>
          <Field icon={Mail}><input className="t-input" type="email" inputMode="email" autoComplete="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" /></Field>
          <Field icon={Lock}><input className="t-input" type="password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Contraseña" /></Field>
          <button type="submit" disabled={submitting} className="t-btn" style={{ marginTop: 4 }}>
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      ) : (
        <form className="t-stack" onSubmit={(e) => { e.preventDefault(); submitRegister(); }}>
          <div className="t-row2">
            <Field icon={User}><input className="t-input" autoComplete="given-name" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" /></Field>
            <Field><input className="t-input" autoComplete="family-name" value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" /></Field>
          </div>
          <Field icon={IdCard}><input className="t-input" inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI/CUIT *" /></Field>
          <Field icon={Phone}><input className="t-input" type="tel" inputMode="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" /></Field>
          <Field icon={Mail}><input className="t-input" type="email" inputMode="email" autoComplete="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email *" /></Field>
          <Field icon={Lock}><input className="t-input" type="password" autoComplete="new-password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Contraseña (mín. 6 caracteres) *" /></Field>
          <button
            type="submit"
            disabled={submitting || !nombre.trim() || !dni.trim() || !regEmail.trim() || regPassword.length < 6}
            className="t-btn"
            style={{ marginTop: 4 }}
          >
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ icon: Icon, children }: { icon?: any; children: React.ReactNode }) {
  return (
    <div className={`t-field${Icon ? ' has-icon' : ''}`}>
      {Icon && <Icon size={16} />}
      {children}
    </div>
  );
}
