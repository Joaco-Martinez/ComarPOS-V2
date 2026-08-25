'use client';

import { useEffect } from 'react';
import LegalLayout, { H2, P, Ul, Mail } from '@/components/legal/LegalLayout';
import { useAuthStore } from '@/store/auth';
import { waLink } from '@/components/landing/siteConfig';
import { LogIn, MessageCircle, ShieldCheck } from 'lucide-react';

// Pagina publica (sin login) para cumplir con la Resolucion 424/2020: el
// Boton de Arrepentimiento tiene que ser facil de encontrar desde afuera del
// sistema, no solo dentro de /suscripcion (que exige sesion iniciada). Acá
// se explica el derecho y se linkea al mecanismo real -- pedir login para la
// baja en si es proporcional (ya hacia falta login para contratar), pero
// dejamos un canal directo (WhatsApp/email) para quien no pueda entrar.
export default function ArrepentimientoPage() {
  const { user, loading, me } = useAuthStore();

  useEffect(() => {
    if (loading) me();
  }, [loading, me]);

  return (
    <LegalLayout title="Botón de Arrepentimiento" updatedAt="25 de agosto de 2026">
      <div style={{ background: 'var(--accent-dim, rgba(13,89,231,0.08))', border: '1px solid rgba(13,89,231,0.25)', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 12, marginBottom: 24 }}>
        <ShieldCheck size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
          Como consumidor, tenés derecho a arrepentirte de tu suscripción a ComarPOS dentro de los{' '}
          <strong>10 (diez) días hábiles</strong> desde que la contrataste, sin costo y sin tener que dar ningún
          motivo (Ley 24.240, art. 34 — Resolución 424/2020 de la Secretaría de Comercio Interior).
        </p>
      </div>

      <H2>¿Qué pasa si me arrepiento?</H2>
      <Ul>
        <li>Cancelamos el cobro automático en Mercado Pago de inmediato — no se te vuelve a cobrar.</li>
        <li>Seguís teniendo acceso al sistema hasta el final del período que ya pagaste.</li>
        <li>No hace falta que justifiques el motivo.</li>
        <li>Podés arrepentirte de la baja también: si todavía no venció tu período pagado, podés reactivar la suscripción cuando quieras desde Suscripción.</li>
      </Ul>

      <H2>Cómo hacerlo</H2>
      <P>
        El mecanismo funciona igual de fácil que contratar: es un solo botón dentro de tu cuenta, en{' '}
        <strong>Suscripción</strong>.
      </P>

      {user ? (
        <a
          href="/suscripcion"
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 8 }}
        >
          <LogIn size={15} /> Ir a Suscripción para dar de baja
        </a>
      ) : (
        <a
          href="/login"
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 8 }}
        >
          <LogIn size={15} /> Iniciar sesión para dar de baja
        </a>
      )}

      <P>
        Si no podés iniciar sesión o preferís que lo hagamos nosotros por vos, escribinos y procesamos el
        arrepentimiento igual:
      </P>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <a
          href={waLink('¡Hola! Quiero ejercer mi derecho de arrepentimiento sobre mi suscripción de ComarPOS.')}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <MessageCircle size={15} /> Escribinos por WhatsApp
        </a>
        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--text2)' }}>
          o por email a <span style={{ marginLeft: 4 }}><Mail /></span>
        </span>
      </div>

      <H2>Otras formas de reclamar</H2>
      <P>
        También podés hacer tu reclamo ante la{' '}
        <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          Ventanilla Única Federal de Defensa del Consumidor
        </a>.
      </P>
    </LegalLayout>
  );
}
