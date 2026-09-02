/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useStore } from '../StoreContext';
import { useAccount } from '../AccountContext';
import { User, Mail, Lock, Phone, IdCard, UserCircle2, LogOut } from 'lucide-react';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D0D5DD', fontSize: 13, outline: 'none',
};

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
      <div style={{ paddingTop: 8, maxWidth: 420, margin: '0 auto', paddingBottom: 40, textAlign: 'center' }}>
        <UserCircle2 size={40} style={{ color: 'var(--store-accent)', marginBottom: 10 }} />
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#172033', marginBottom: 2 }}>{account.name}</h2>
        <p style={{ fontSize: 12, color: '#667085', marginBottom: 24 }}>{account.email}</p>
        <button
          onClick={async () => { await logout(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
            border: '1px solid #E4E7EC', background: '#fff', fontSize: 13, fontWeight: 700, color: '#F04438', cursor: 'pointer',
          }}
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8, maxWidth: 420, margin: '0 auto', paddingBottom: 40 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#172033', marginBottom: 4, textAlign: 'center' }}>
        {tab === 'login' ? 'Ingresá a tu cuenta' : `Creá tu cuenta en ${store.storeName}`}
      </h2>
      <p style={{ fontSize: 12, color: '#667085', marginBottom: 20, textAlign: 'center' }}>
        Necesitás una cuenta para completar una compra en esta tienda.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#F7F8FA', padding: 4, borderRadius: 10 }}>
        <button
          onClick={() => setTab('login')}
          style={tabButtonStyle(tab === 'login')}
        >
          Ya tengo cuenta
        </button>
        <button
          onClick={() => setTab('register')}
          style={tabButtonStyle(tab === 'register')}
        >
          Crear cuenta
        </button>
      </div>

      {tab === 'login' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field icon={Mail}><input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" style={inputStyle} /></Field>
          <Field icon={Lock}><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Contraseña" style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && submitLogin()} /></Field>
          <button onClick={submitLogin} disabled={submitting} style={submitButtonStyle}>
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field icon={User}><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" style={inputStyle} /></Field>
            <Field><input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" style={inputStyle} /></Field>
          </div>
          <Field icon={IdCard}><input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI/CUIT *" style={inputStyle} /></Field>
          <Field icon={Phone}><input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" style={inputStyle} /></Field>
          <Field icon={Mail}><input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email *" style={inputStyle} /></Field>
          <Field icon={Lock}><input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Contraseña (mínimo 6 caracteres) *" style={inputStyle} /></Field>
          <button
            onClick={submitRegister}
            disabled={submitting || !nombre.trim() || !dni.trim() || !regEmail.trim() || regPassword.length < 6}
            style={submitButtonStyle}
          >
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ icon: Icon, children }: { icon?: any; children: React.ReactNode }) {
  if (!Icon) return <div style={{ flex: 1 }}>{children}</div>;
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <Icon size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#98A2B3' }} />
      <div style={{ paddingLeft: 26 }}>{children}</div>
    </div>
  );
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none',
    background: active ? '#fff' : 'transparent', color: active ? '#172033' : '#667085',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
  };
}

const submitButtonStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 8, border: 'none',
  background: 'var(--store-accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4,
};
