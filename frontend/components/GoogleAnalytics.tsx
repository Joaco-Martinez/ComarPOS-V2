'use client';

import Script from 'next/script';

// Opt-in, mismo criterio que Sentry/Firebase en el backend: sin ninguna env
// var configurada, este componente no renderiza nada -- cero requests, cero
// cookies de analitica. Para activarlo: crear una propiedad GA4 en
// analytics.google.com y poner el Measurement ID (formato G-XXXXXXXXXX) en
// NEXT_PUBLIC_GA_MEASUREMENT_ID. NEXT_PUBLIC_GA_MEASUREMENT_ID_2 es opcional,
// para trackear una segunda propiedad GA4 en paralelo. NEXT_PUBLIC_GOOGLE_ADS_ID
// (formato AW-XXXXXXXXXX) es el tag de conversion de Google Ads. Las tres
// comparten una unica carga de gtag.js -- cargarlo mas de una vez duplica
// ~150-190KB por copia y fue el mayor contribuyente al TBT en PageSpeed.
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const id2 = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID_2;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const ids = [id, id2, adsId].filter(Boolean);
  if (ids.length === 0) return null;

  return (
    <>
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <link rel="preconnect" href="https://www.google-analytics.com" />
      {adsId && <link rel="preconnect" href="https://googleads.g.doubleclick.net" />}
      {adsId && <link rel="preconnect" href="https://www.google.com" />}
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${ids[0]}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${ids.map((gid) => `gtag('config', '${gid}');`).join('\n          ')}
        `}
      </Script>
    </>
  );
}
