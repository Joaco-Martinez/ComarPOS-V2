'use client';

import Script from 'next/script';

// Opt-in, mismo criterio que Sentry/Firebase en el backend: sin
// NEXT_PUBLIC_GA_MEASUREMENT_ID configurado, este componente no renderiza
// nada -- cero requests, cero cookies de analitica. Para activarlo: crear
// una propiedad GA4 en analytics.google.com y poner el Measurement ID
// (formato G-XXXXXXXXXX) en NEXT_PUBLIC_GA_MEASUREMENT_ID.
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!id) return null;

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
