import type { Metadata } from 'next';
import LegalLayout, { H2, P, Ul, Mail } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Condiciones de uso del servicio ComarPOS.',
};

export default function TerminosPage() {
  return (
    <LegalLayout title="Términos y condiciones" updatedAt="24 de agosto de 2026">
      <P>
        Estos términos regulan el uso de ComarPOS, un sistema de gestión (ERP + punto de venta) provisto por{' '}
        <strong>[COMPLETAR: razón social / nombre y CUIT del titular del servicio]</strong> ("nosotros", "ComarPOS").
        Al crear una cuenta o usar el sistema, aceptás estos términos. Si no estás de acuerdo, no uses el servicio.
      </P>

      <H2>1. Descripción del servicio</H2>
      <P>
        ComarPOS es un software como servicio (SaaS) que incluye punto de venta, facturación electrónica AFIP,
        gestión de stock, caja, clientes, cuentas corrientes, remitos y reportes, entre otras funciones. Se
        accede vía web/PWA y, cuando esté disponible, vía app para Android/iOS.
      </P>

      <H2>2. Cuenta y período de prueba</H2>
      <P>
        Para usar ComarPOS necesitás crear una cuenta con datos veraces. Ofrecemos una prueba gratuita de 7 días
        sin necesidad de tarjeta de crédito. Al finalizar la prueba, para seguir usando el sistema hace falta
        activar una suscripción paga.
      </P>

      <H2>3. Planes, precios y facturación</H2>
      <P>
        El precio vigente del plan se muestra en comarpos.com.ar antes de suscribirte. Podemos modificar los
        precios hacia adelante, avisándote con anticipación razonable — los cambios de precio nunca aplican de
        forma retroactiva a un período ya pagado. El cobro se procesa a través de Mercado Pago; nosotros no
        almacenamos los datos de tu tarjeta.
      </P>
      <P>
        Si un pago no se acredita, podemos suspender el acceso a la cuenta hasta que se regularice, sin que eso
        implique la eliminación inmediata de tus datos.
      </P>

      <H2>4. Cancelación</H2>
      <P>
        Podés cancelar tu suscripción cuando quieras desde el sistema o escribiéndonos. La cancelación aplica
        hacia adelante; no reembolsamos el período ya en curso salvo que la normativa de defensa del consumidor
        aplicable indique lo contrario.
      </P>

      <H2>5. Tus datos y los datos de tus clientes</H2>
      <P>
        Vos sos el responsable de la información que cargás en el sistema, incluidos los datos de tus propios
        clientes (nombre, DNI, contacto, etc.) y los datos fiscales de tu negocio que usamos para facturar en tu
        nombre. Declarás que tenés derecho a cargar esos datos y a autorizarnos a procesarlos para prestarte el
        servicio. Más detalle sobre cómo tratamos estos datos en nuestra{' '}
        <a href="/privacidad" style={{ color: 'var(--accent)' }}>Política de privacidad</a>.
      </P>

      <H2>6. Facturación electrónica AFIP/ARCA</H2>
      <P>
        ComarPOS actúa como intermediario técnico entre tu negocio y los web services de AFIP/ARCA, usando los
        certificados y credenciales fiscales que vos mismo cargás en el sistema. Vos sos el único responsable
        de que esos datos fiscales sean correctos y estén vigentes. Si AFIP no responde, el sistema reintenta
        automáticamente, pero no garantizamos la disponibilidad de los servicios de AFIP, que están fuera de
        nuestro control.
      </P>

      <H2>7. Uso permitido</H2>
      <Ul>
        <li>No usar el sistema para actividades ilícitas o para cargar datos falsos que puedan derivar en facturación fiscal irregular.</li>
        <li>No intentar vulnerar la seguridad del sistema ni acceder a datos de otras cuentas/tenants.</li>
        <li>No revender ni sublicenciar el acceso al sistema sin autorización nuestra.</li>
        <li>Sos responsable de mantener la confidencialidad de las contraseñas de tu cuenta y las de tus empleados.</li>
      </Ul>

      <H2>8. Propiedad intelectual</H2>
      <P>
        El software, el diseño, la marca ComarPOS y todo el contenido del sitio nos pertenecen o están
        licenciados a nuestro favor. Esta licencia no te transfiere ninguna propiedad sobre el software; solo
        te da derecho a usarlo mientras tu cuenta esté activa. Los datos que vos cargás (productos, clientes,
        ventas) siguen siendo tuyos.
      </P>

      <H2>9. Disponibilidad del servicio</H2>
      <P>
        Hacemos un esfuerzo razonable para mantener el sistema disponible, pero no garantizamos un
        funcionamiento ininterrumpido. Puede haber mantenimientos programados o caídas no planificadas de
        nuestra infraestructura o de proveedores externos (por ejemplo, AFIP, Mercado Pago, Google).
      </P>

      <H2>10. Límite de responsabilidad</H2>
      <P>
        En la medida permitida por la ley, no somos responsables por daños indirectos, pérdida de ganancias o
        de datos derivados del uso del sistema, salvo en los casos de dolo o culpa grave de nuestra parte.
        Nada en estos términos limita los derechos que la Ley de Defensa del Consumidor (24.240) te reconoce
        como consumidor o usuario.
      </P>

      <H2>11. Modificaciones a estos términos</H2>
      <P>
        Podemos actualizar estos términos para reflejar cambios en el servicio o en la normativa aplicable. Si
        el cambio es significativo, te lo vamos a avisar por email o dentro del sistema antes de que entre en
        vigencia.
      </P>

      <H2>12. Ley aplicable</H2>
      <P>
        Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia se someterá a
        los tribunales ordinarios competentes, sin perjuicio de tu derecho como consumidor a reclamar ante el
        tribunal de tu domicilio.
      </P>

      <H2>13. Contacto</H2>
      <P>
        Ante cualquier duda sobre estos términos, escribinos a <Mail />.
      </P>
    </LegalLayout>
  );
}
