'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { COOKIE_CONSENT_EVENT, getCookieConsent } from './CookieBanner';

// Opt-in, mismo criterio que Sentry/Firebase en el backend: sin
// NEXT_PUBLIC_GA_MEASUREMENT_ID configurado, este componente no renderiza
// nada -- cero requests, cero cookies de analitica. Para activarlo: crear
// una propiedad GA4 en analytics.google.com y poner el Measurement ID
// (formato G-XXXXXXXXXX) en NEXT_PUBLIC_GA_MEASUREMENT_ID.
//
// Ademas, incluso con el ID configurado, no carga el script hasta que el
// usuario acepta las cookies de analitica en el CookieBanner -- GA usa
// cookies, asi que requiere consentimiento previo.
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (!id) return;
    const check = () => setConsented(getCookieConsent() === 'accepted');
    check();
    window.addEventListener(COOKIE_CONSENT_EVENT, check);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, check);
  }, [id]);

  if (!id || !consented) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}
