'use client';

import Script from 'next/script';

// Opt-in, mismo criterio que Sentry/Firebase en el backend: sin ninguna de
// las dos env vars configuradas, este componente no renderiza nada -- cero
// requests, cero cookies de analitica. Para activarlo: crear una propiedad
// GA4 en analytics.google.com y poner el Measurement ID (formato
// G-XXXXXXXXXX) en NEXT_PUBLIC_GA_MEASUREMENT_ID. NEXT_PUBLIC_GA_MEASUREMENT_ID_2
// es opcional, para trackear una segunda propiedad GA4 en paralelo con la
// misma carga de gtag.js (no hace falta cargar el script dos veces, un solo
// gtag('config', ...) por propiedad alcanza).
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const id2 = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID_2;
  if (!id && !id2) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id ?? id2}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${id ? `gtag('config', '${id}');` : ''}
          ${id2 ? `gtag('config', '${id2}');` : ''}
        `}
      </Script>
    </>
  );
}
