import type { Metadata } from 'next';
import LegalLayout, { H2, P, Ul, Mail } from '@/components/legal/LegalLayout';

const title = 'Sobre ComarPOS';
const description = 'Qué es ComarPOS, para quién está pensado y quién está detrás del producto.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about' },
  openGraph: { title, description, url: 'https://www.comarpos.com/about', type: 'website' },
  twitter: { title, description },
};

export default function AboutPage() {
  return (
    <LegalLayout title={title} updatedAt="29 de agosto de 2026">
      <P>
        ComarPOS es un sistema de gestión (ERP + punto de venta) para comercios de cualquier rubro,
        con facturación electrónica AFIP/ARCA integrada. Junta en un solo lugar la venta en mostrador,
        la facturación fiscal, el control de stock, la caja y los reportes de un negocio, pensado para
        usarse desde el mostrador de un local — no desde una oficina de sistemas.
      </P>
      <P>
        Está pensado para comercios físicos en Argentina: kioscos y almacenes, veterinarias, ferreterías,
        indumentaria, farmacias, librerías, vinotecas, perfumerías, distribuidoras, talleres de reparación
        y cualquier otro rubro que necesite vender, facturar y controlar stock desde un mismo sistema.
      </P>

      <H2>Qué lo distingue</H2>
      <Ul>
        <li><strong>Todo en un solo lugar</strong>: ventas, facturación, stock y finanzas conectados entre sí, sin planillas sueltas ni sistemas que no se hablan.</li>
        <li><strong>Facturación AFIP real</strong>: emite factura electrónica con CAE, y reintenta solo si AFIP/ARCA está caído.</li>
        <li><strong>Se adapta al rubro</strong>: venta por unidad, por kilo, en combos o con lista de precios propia por cliente.</li>
        <li><strong>Crece con el negocio</strong>: se pueden sumar sucursales, usuarios y stock sin migrar de sistema ni perder el historial.</li>
      </Ul>

      <H2>Quién está detrás</H2>
      <P>
        ComarPOS es desarrollado y operado por <strong>Joaquín Martínez, CUIT 20-46587629-9</strong>, con
        domicilio en Córdoba, Argentina. Para consultas comerciales o técnicas, ver la página de{' '}
        <a href="/contact" style={{ color: 'var(--accent)' }}>contacto</a> o escribir a <Mail />.
      </P>

      <H2>Más información</H2>
      <Ul>
        <li>Detalle de planes y precios: <a href="/#planes" style={{ color: 'var(--accent)' }}>comarpos.com/#planes</a></li>
        <li>Política de privacidad: <a href="/privacidad" style={{ color: 'var(--accent)' }}>/privacidad</a></li>
        <li>Términos y condiciones: <a href="/terminos" style={{ color: 'var(--accent)' }}>/terminos</a></li>
      </Ul>
    </LegalLayout>
  );
}
