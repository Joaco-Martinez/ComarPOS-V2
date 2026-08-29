import type { Metadata } from 'next';
import LegalLayout from '@/components/legal/LegalLayout';
import PrivacyContent from '@/components/legal/PrivacyContent';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Cómo ComarPOS recopila, usa y protege los datos de tu cuenta y de tu negocio.',
};

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad" updatedAt="25 de agosto de 2026">
      <PrivacyContent />
    </LegalLayout>
  );
}
