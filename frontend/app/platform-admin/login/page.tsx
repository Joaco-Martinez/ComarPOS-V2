'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlatformAuthStore } from '@/store/platformAuth';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function PlatformAdminLoginPage() {
  const { login } = usePlatformAuthStore();
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
      router.replace('/platform-admin');
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
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <ShieldCheck size={40} style={{ color: 'var(--accent)', marginBottom: 10 }} />
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>Panel de plataforma</div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Gestión de tenants y suscripciones</p>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 12, padding: 28,
        }}>
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
                placeholder="tu@comarpos.com"
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
      </div>
    </div>
  );
}
