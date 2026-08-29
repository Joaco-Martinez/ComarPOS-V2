import type { Metadata } from 'next';
import LegalLayout, { H2, P, Ul, Mail } from '@/components/legal/LegalLayout';
import { waLink } from '@/components/landing/siteConfig';

const title = 'Contacto';
const description = 'Cómo contactar a ComarPOS: WhatsApp, email y datos de la empresa que opera el servicio.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact' },
  openGraph: { title, description, url: 'https://www.comarpos.com/contact', type: 'website' },
  twitter: { title, description },
};

export default function ContactPage() {
  return (
    <LegalLayout title={title} updatedAt="29 de agosto de 2026">
      <P>
        Para consultas comerciales (demo, planes, si ComarPOS sirve para tu rubro) o soporte técnico
        de una cuenta existente, estos son los canales disponibles:
      </P>

      <H2>WhatsApp</H2>
      <P>
        La vía más rápida para una demo o consulta comercial:{' '}
        <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          +54 9 3546 541413
        </a>.
      </P>

      <H2>Email</H2>
      <P>
        Para soporte, facturación o cualquier consulta por escrito: <Mail />.
      </P>

      <H2>Datos de la empresa</H2>
      <P>
        ComarPOS es operado por <strong>Joaquín Martínez, CUIT 20-46587629-9</strong>, con domicilio en
        Córdoba, Argentina.
      </P>

      <H2>Ya sos cliente</H2>
      <Ul>
        <li>Iniciar sesión en el sistema: <a href="/login" style={{ color: 'var(--accent)' }}>/login</a></li>
        <li>Gestionar tu suscripción: <a href="/suscripcion" style={{ color: 'var(--accent)' }}>/suscripcion</a> (requiere iniciar sesión)</li>
      </Ul>
    </LegalLayout>
  );
}
