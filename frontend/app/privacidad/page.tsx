import type { Metadata } from 'next';
import LegalLayout, { H2, P, Ul, Mail } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Cómo ComarPOS recopila, usa y protege los datos de tu cuenta y de tu negocio.',
};

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad" updatedAt="25 de agosto de 2026">
      <P>
        Esta política explica qué datos recopila ComarPOS ("nosotros", "el Servicio"), para qué los usa,
        con quién los comparte y qué derechos tenés sobre ellos. Aplica tanto al sitio público
        (comarpos.com) como al sistema en sí (web, PWA y las apps de Android/iOS).
      </P>
      <P>
        Responsable del tratamiento: <strong>Joaquín Martínez, CUIT 20-46587629-9, domicilio en Córdoba, Argentina</strong>.
        Contacto para cualquier consulta o reclamo sobre tus datos: <Mail />.
      </P>

      <H2>1. Un punto importante: dos roles distintos</H2>
      <P>
        ComarPOS es un sistema de gestión que tu negocio usa para administrar sus propias ventas,
        clientes y facturación. Por eso hay dos situaciones distintas:
      </P>
      <Ul>
        <li>
          <strong>Datos de tu cuenta como usuario del sistema</strong> (vos, tus empleados): acá ComarPOS es
          el <strong>responsable</strong> del tratamiento, y esta política aplica de forma directa.
        </li>
        <li>
          <strong>Datos que vos cargás sobre tus propios clientes</strong> (nombre, DNI, teléfono, dirección,
          historial de compras de las personas que le compran a tu negocio): ahí vos sos el responsable del
          tratamiento frente a esas personas, y ComarPOS actúa como <strong>encargado del tratamiento</strong> —
          almacenamos y procesamos esos datos únicamente para prestarte el servicio, siguiendo tus instrucciones
          (lo que vos cargás y configurás en el sistema), y no los usamos para ningún fin propio.
        </li>
      </Ul>

      <H2>2. Qué datos recopilamos</H2>
      <P><strong>De tu cuenta y tu negocio:</strong></P>
      <Ul>
        <li>Datos de registro: nombre, email, contraseña (guardada encriptada, nunca en texto plano), rol dentro del sistema.</li>
        <li>Datos fiscales de tu negocio: razón social, CUIT, punto de venta, y los certificados de AFIP/ARCA que cargás para facturar (guardados encriptados).</li>
        <li>Datos de facturación del servicio: los gestiona Mercado Pago directamente — nosotros no almacenamos números de tarjeta.</li>
      </Ul>
      <P><strong>De los clientes que vos cargás en el sistema:</strong></P>
      <Ul>
        <li>Nombre, apellido, DNI, teléfono y email.</li>
        <li>Dirección y, si usás el cálculo de envíos, su geolocalización (latitud/longitud).</li>
        <li>Historial de compras, cuenta corriente y límite de crédito, si los usás.</li>
      </Ul>
      <P><strong>Datos técnicos y de uso:</strong></P>
      <Ul>
        <li>Dirección IP, tipo de dispositivo y navegador, páginas visitadas.</li>
        <li>Cookies de sesión, necesarias para mantenerte logueado.</li>
        <li>Estadísticas de uso vía Google Analytics y Vercel Analytics (ver sección 5).</li>
        <li>Si instalás la app en tu celular y activás las notificaciones push, un identificador de dispositivo (token) para poder enviártelas.</li>
      </Ul>

      <H2>3. Para qué usamos estos datos</H2>
      <Ul>
        <li>Prestar el servicio: ventas, facturación electrónica AFIP, stock, caja, reportes, remitos, etc.</li>
        <li>Emitir comprobantes fiscales válidos, lo que requiere enviar ciertos datos de la operación a los web services de AFIP/ARCA.</li>
        <li>Enviarte notificaciones del sistema (por ejemplo, stock bajo o novedades de tu cuenta), por email o push.</li>
        <li>Procesar el cobro de tu suscripción a través de Mercado Pago.</li>
        <li>Brindarte soporte cuando nos escribís.</li>
        <li>Entender cómo se usa el producto para mejorarlo, de forma agregada y anónima cuando es posible.</li>
        <li>Cumplir obligaciones legales (por ejemplo, plazos de conservación de comprobantes que exige la normativa fiscal argentina).</li>
      </Ul>

      <H2>4. Con quién compartimos datos</H2>
      <P>
        No vendemos tus datos ni los de tus clientes a nadie. Los compartimos únicamente con los proveedores
        que necesitamos para que el servicio funcione, cada uno procesando solo lo que le corresponde:
      </P>
      <Ul>
        <li><strong>AFIP/ARCA</strong> — obligatorio para emitir factura electrónica válida a nombre de tu negocio.</li>
        <li><strong>Mercado Pago</strong> — procesamiento del pago de tu suscripción.</li>
        <li><strong>Cloudinary</strong> — almacenamiento de las imágenes que subís (productos, logo, etc).</li>
        <li><strong>Firebase (Google)</strong> — envío de notificaciones push a la app móvil.</li>
        <li><strong>Google Maps</strong> — cálculo de distancia/costo de envíos, si usás esa función.</li>
        <li><strong>Railway</strong> — hosting de la base de datos y el servidor.</li>
        <li><strong>Google Analytics y Vercel</strong> — analítica de uso del sitio (ver sección 5).</li>
      </Ul>
      <P>
        Podemos además divulgar información si una autoridad competente lo requiere por ley, o si es necesario
        para proteger nuestros derechos o los de terceros.
      </P>

      <H2>5. Cookies y analítica</H2>
      <P>
        Usamos una cookie de sesión propia, necesaria para mantenerte logueado — sin ella el sistema no
        funciona, así que no requiere tu consentimiento. Además, solo si lo aceptás en el aviso de cookies
        que aparece al entrar al sitio, usamos:
      </P>
      <Ul>
        <li><strong>Google Analytics</strong>, que usa cookies para medir visitas y uso del sitio de forma estadística.</li>
        <li><strong>Vercel Analytics</strong>, una analítica sin cookies (no identifica individualmente a cada visitante) — no requiere consentimiento y corre siempre.</li>
      </Ul>
      <P>
        Podés aceptar o rechazar las cookies de Google Analytics cuando te lo preguntamos, y cambiar tu
        elección cuando quieras desde el link <strong>&quot;Preferencias de cookies&quot;</strong> al pie de
        esta página. También podés bloquearlas desde la configuración de tu navegador, sin que eso afecte el
        funcionamiento del sistema.
      </P>

      <H2>6. Seguridad</H2>
      <P>
        Las contraseñas se guardan encriptadas (hash), nunca en texto plano. Los certificados y credenciales
        de AFIP se guardan encriptados en la base de datos. Toda la comunicación con el sistema viaja cifrada
        (HTTPS). Ningún sistema es 100% infalible, pero tomamos medidas razonables para proteger tu información
        y la de tus clientes.
      </P>

      <H2>7. Conservación de los datos</H2>
      <P>
        Mientras tu cuenta esté activa, conservamos los datos necesarios para prestarte el servicio. Los
        comprobantes fiscales (facturas, notas de crédito, remitos) se conservan por el plazo que exige la
        normativa impositiva argentina, incluso si más adelante cancelás tu cuenta. Si cancelás tu cuenta,
        podés pedirnos la baja del resto de los datos escribiendo a <Mail /> — sujeto a esos plazos legales de
        conservación fiscal.
      </P>

      <H2>8. Tus derechos</H2>
      <P>
        Bajo la Ley 25.326 de Protección de Datos Personales, tenés derecho a acceder, rectificar, actualizar
        y solicitar la supresión de tus datos personales, así como a saber si están siendo tratados y por qué.
        Para ejercer estos derechos, escribinos a <Mail />. La Agencia de Acceso a la Información Pública (AAIP),
        órgano de control de la Ley 25.326, es la autoridad ante la que podés reclamar si considerás que no
        respetamos tus derechos.
      </P>

      <H2>9. Menores de edad</H2>
      <P>
        ComarPOS es un sistema de gestión para negocios y no está dirigido a menores de edad. No recopilamos
        deliberadamente datos de menores como usuarios de la cuenta.
      </P>

      <H2>10. Cambios a esta política</H2>
      <P>
        Podemos actualizar esta política para reflejar cambios en el servicio o en la normativa aplicable. Si
        el cambio es significativo, te lo vamos a avisar por email o dentro del sistema. La fecha de "última
        actualización" al principio de esta página siempre va a estar al día.
      </P>

      <H2>11. Contacto</H2>
      <P>
        Ante cualquier duda sobre esta política o tus datos, escribinos a <Mail />.
      </P>
    </LegalLayout>
  );
}
