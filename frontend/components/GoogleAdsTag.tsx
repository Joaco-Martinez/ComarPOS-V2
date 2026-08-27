'use client';

import Script from 'next/script';

// Mismo criterio opt-in que components/GoogleAnalytics.tsx: sin
// NEXT_PUBLIC_GOOGLE_ADS_ID configurado, este componente no renderiza nada.
// Tag de conversión de Google Ads (formato AW-XXXXXXXXXX), separado de GA4
// porque son dos propiedades distintas en Google -- si en algún momento se
// quiere evitar cargar gtag.js dos veces cuando ambas están configuradas,
// este es el lugar para unificarlo con GoogleAnalytics.tsx.
export default function GoogleAdsTag() {
  const id = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (!id) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="google-ads-tag" strategy="afterInteractive">
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
