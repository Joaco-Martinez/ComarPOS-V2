'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { user, loading: sessionLoading, me, login } = useAuthStore();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Si ya hay sesión activa, redirigir al POS
  useEffect(() => {
    if (sessionLoading) me();
  }, [sessionLoading, me]);

  useEffect(() => {
    if (!sessionLoading && user?.tenantSlug) {
      router.replace(`/${user.tenantSlug}/pos`);
    }
  }, [user, sessionLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Completá todos los campos.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const loggedInUser = await login(email.trim(), password);

      if (!loggedInUser.tenantSlug) {
        setError(
          'Tu usuario no tiene un negocio asignado. Contactá a soporte.'
        );
        return;
      }

      router.replace(`/${loggedInUser.tenantSlug}/pos`);
    } catch {
      setError('Email o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />

      {/* Glow principal */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 640,
          height: 640,
          background:
            'radial-gradient(circle, rgba(13,89,231,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Glow secundario */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          right: '10%',
          width: 320,
          height: 320,
          background:
            'radial-gradient(circle, rgba(0,180,219,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* CONTENEDOR PRINCIPAL */}
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          position: 'relative',
          animation: 'fadeIn 0.4s ease',
        }}
      >
        {/* 
          ESPACIO FIJO PARA EL LOGO

          El alto está fijado para que agrandar el logo
          NO empuje el login hacia abajo.
        */}
        <div
          style={{
            height: 175,
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          {/* Logo oscuro */}
          <img
            src="/brand/logo-horizontal-negativo.svg"
            alt="ComarPOS"
            className="brand-logo-dark"
            style={{
              position: 'absolute',
              width: 500,
              maxWidth: '95vw',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />

          {/* Logo claro */}
          <img
            src="/brand/logo-horizontal-positivo.svg"
            alt="ComarPOS"
            className="brand-logo-light"
            style={{
              position: 'absolute',
              width: 500,
              maxWidth: '95vw',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* CARD LOGIN */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--m-radius-lg, 12px)',
            padding: 28,
            boxShadow: 'var(--m-shadow-lg, 0 24px 48px rgba(0,0,0,0.4))',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            Iniciar sesión
          </h2>

          <p
            style={{
              fontSize: 12,
              color: 'var(--text3)',
              marginBottom: 24,
            }}
          >
            Ingresá tus credenciales para continuar
          </p>

          {/* ERROR */}
          {error && (
            <div
              style={{
                background: 'var(--danger-dim)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                padding: '9px 12px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* EMAIL */}
            <div className="form-group">
              <label className="form-label">Email</label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            {/* PASSWORD */}
            <div className="form-group">
              <label className="form-label">Contraseña</label>

              <div
                style={{
                  position: 'relative',
                }}
              >
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  style={{
                    paddingRight: 42,
                  }}
                />

                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  disabled={loading}
                  style={{
                    position: 'absolute',
                    right: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPass ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
              </div>
            </div>

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 6,
                gap: 8,
              }}
              disabled={loading}
            >
              {loading ? (
                <span
                  className="spinner"
                  style={{
                    width: 15,
                    height: 15,
                  }}
                />
              ) : (
                <>
                  <ShieldCheck size={15} />
                  Ingresar
                </>
              )}
            </button>
          </form>
        </div>

        {/* FOOTER */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text3)',
            marginTop: 20,
            fontFamily: 'var(--mono)',
          }}
        >
          © {new Date().getFullYear()} ComarPOS · Sistema ERP
        </p>
      </div>
    </div>
  );
}