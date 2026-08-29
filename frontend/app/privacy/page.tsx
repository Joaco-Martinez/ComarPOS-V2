import type { Metadata } from 'next';
import LegalLayout, { P } from '@/components/legal/LegalLayout';
import PrivacyContent from '@/components/legal/PrivacyContent';

const title = 'Privacy Policy';
const description = "How ComarPOS collects, uses and protects your account and business data.";

// Alias en ingles de /privacidad (URL canonica, texto legal en espanol) --
// mismo contenido, para que un agente que busca /privacy en vez de
// /privacidad encuentre la politica igual. El canonical apunta a
// /privacidad para no generar contenido duplicado a ojos de un buscador.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacidad' },
  openGraph: { title, description, url: 'https://www.comarpos.com/privacy', type: 'website' },
  twitter: { title, description },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad — Privacy Policy" updatedAt="25 de agosto de 2026">
      <P>
        This is ComarPOS&apos;s privacy policy. The legally-binding text is authored in Spanish
        (ComarPOS operates in Argentina, under Argentine data protection law — Ley 25.326). It is
        also published at the canonical URL <a href="/privacidad" style={{ color: 'var(--accent)' }}>/privacidad</a>.
      </P>
      <PrivacyContent />
    </LegalLayout>
  );
}
