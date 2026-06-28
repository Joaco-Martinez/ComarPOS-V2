'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Completá todos los campos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      router.replace('/pos');
    } catch {
      setError('Email o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px', opacity: 0.4, pointerEvents: 'none',
      }} />

      {/* Glows */}
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 640, height: 640, background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '5%', right: '10%', width: 320, height: 320, background: 'radial-gradient(circle, rgba(0,180,219,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', animation: 'fadeIn 0.4s ease' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <circle cx="18" cy="20" r="14" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray="60 88" strokeDashoffset="-10" />
              <rect x="25" y="27" width="9" height="9" rx="2" fill="#22C55E" />
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: -1 }}>
                Comar<span style={{ color: 'var(--accent)' }}>POS</span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent2)', letterSpacing: 3, marginTop: 3 }}>
                SISTEMA ERP
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>Sistema que impulsa tu negocio</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 12, padding: 28,
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Iniciar sesión</h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 24 }}>Ingresá tus credenciales para continuar</p>

          {error && (
            <div style={{
              background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, padding: '9px 12px', marginBottom: 16,
              fontSize: 13, color: 'var(--danger)',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
                required autoFocus disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required disabled={loading}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  disabled={loading}
                  style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0 }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 6, gap: 8 }}
              disabled={loading}
            >
              {loading ? <span className="spinner" style={{ width: 15, height: 15 }} /> : (
                <><ShieldCheck size={15} /> Ingresar</>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20, fontFamily: 'var(--mono)' }}>
          © {new Date().getFullYear()} ComarPOS · Sistema ERP
        </p>
      </div>
    </div>
  );
}
