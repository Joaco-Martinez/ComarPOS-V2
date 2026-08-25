'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { COOKIE_CONSENT_EVENT, COOKIE_CONSENT_KEY, getCookieConsent } from './CookieBanner';

// Opt-in, mismo criterio que Sentry/Firebase en el backend: sin
// NEXT_PUBLIC_GA_MEASUREMENT_ID configurado, este componente no renderiza
// nada -- cero requests, cero cookies de analitica. Para activarlo: crear
// una propiedad GA4 en analytics.google.com y poner el Measurement ID
// (formato G-XXXXXXXXXX) en NEXT_PUBLIC_GA_MEASUREMENT_ID.
//
// Usa Google Consent Mode: el script de gtag.js y la llamada 'config' se
// cargan siempre (por eso el verificador de etiquetas de Google la
// detecta), pero arrancan con analytics_storage en 'denied' salvo que ya
// haya consentimiento guardado de una visita anterior -- con 'denied', GA
// no setea cookies ni guarda datos identificables. Recien cuando el
// usuario acepta el CookieBanner se manda 'consent' 'update' a 'granted'.
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (!id) return;
    const update = () => {
      const granted = getCookieConsent() === 'accepted';
      (window as any).gtag?.('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, update);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, update);
  }, [id]);

  if (!id) return null;

  return (
    <>
      <Script id="google-analytics" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          var granted = false;
          try { granted = localStorage.getItem('${COOKIE_CONSENT_KEY}') === 'accepted'; } catch (e) {}
          gtag('consent', 'default', {
            analytics_storage: granted ? 'granted' : 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
          });
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    </>
  );
}
