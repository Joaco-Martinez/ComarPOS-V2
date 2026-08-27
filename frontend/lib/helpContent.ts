// Contenido estático del Centro de ayuda (sin IA): preguntas y respuestas ya
// armadas, organizadas por sección, para que cualquier usuario resuelva dudas
// del sistema sin depender de un bot conversacional. Ver components/HelpCenter.tsx.
import type { ComarIconProps } from '@/components/icons/ComarIcons';
import {
  PosIcon, FacturacionIcon, ProductosIcon, CajaIcon, ClientesIcon, RemitosIcon,
  DevolucionesIcon, ComprasIcon, FinanzasIcon, PromocionesIcon, UsuariosIcon, PrintboxIcon,
  ServiciosIcon,
  HoteleriaIcon,
} from '@/components/icons/ComarIcons';
import { Rocket, CreditCard, Smartphone } from 'lucide-react';

export type HelpIconComponent = (props: ComarIconProps) => React.JSX.Element;
export type HelpEntry = { q: string; a: string; keywords?: string };
export type HelpCategory = { id: string; label: string; icon: HelpIconComponent; entries: HelpEntry[] };

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'primeros-pasos',
    label: 'Primeros pasos',
    icon: Rocket as unknown as HelpIconComponent,
    entries: [
      {
        q: '¿Cómo empiezo a usar ComarPOS?',
        a: 'Al crear tu cuenta (prueba gratis o suscripción directa) se crea automáticamente tu negocio, tu usuario administrador y una primera sucursal llamada "Casa Central". Con eso ya podés entrar al POS y empezar a cargar productos y vender.',
      },
      {
        q: '¿Necesito instalar algo?',
        a: 'No. ComarPOS funciona 100% desde el navegador. También se puede instalar como app en el celular o en la compu (como PWA) para tener un ícono propio y abrirlo más rápido, sin pasar por ninguna tienda de aplicaciones.',
      },
      {
        q: '¿Por dónde empiezo a cargar mi negocio?',
        a: 'El orden recomendado es:\n- Categorías: creá las categorías de tus productos.\n- Productos: cargá tus productos con precio, stock inicial y, si vendés por kilo, marcalo como producto por peso.\n- Clientes (opcional): si trabajás con cuenta corriente o fidelización.\n- Empezá a vender desde el POS.',
      },
      {
        q: '¿Qué pasa cuando termina la prueba gratis?',
        a: 'La prueba dura 7 días desde que creaste la cuenta. Cuando vence, el sistema bloquea el acceso hasta que se active la suscripción paga; los datos cargados durante la prueba no se pierden.',
      },
      {
        q: 'Ya tengo cuenta, ¿dónde inicio sesión?',
        a: 'Desde la pantalla de login con tu email y contraseña. La URL de tu negocio siempre incluye el nombre de tu empresa (por ejemplo /tu-negocio/pos); si entrás con una URL vieja guardada en favoritos, el sistema la corrige solo una vez que iniciás sesión.',
      },
    ],
  },
  {
    id: 'pos-ventas',
    label: 'POS y Ventas',
    icon: PosIcon,
    entries: [
      {
        q: '¿Cómo hago una venta?',
        a: 'Desde POS — Ventas: buscá el producto por nombre o escaneá el código de barras (con lector físico o la cámara del celular), armá el carrito, elegí el o los medios de pago y confirmá. Si el cliente pide factura, se emite en el momento con CAE de AFIP.',
      },
      {
        q: '¿Puedo vender por kilo o en combos?',
        a: 'Sí. Un producto puede venderse por unidad (cantidad entera) o por kilo (peso, con decimales). También se pueden armar productos compuestos (combos/kits) hechos de otros productos, que descuentan el stock de cada componente al venderse.',
      },
      {
        q: '¿Qué medios de pago admite una venta?',
        a: 'Efectivo, débito, crédito, QR, transferencia y cuenta corriente (fiado a un cliente con límite de crédito). Se puede combinar más de un medio de pago en la misma venta (por ejemplo, parte en efectivo y el resto con tarjeta).',
      },
      {
        q: '¿Cómo edito o anulo una venta ya hecha?',
        a: 'Desde Historial de Ventas se puede editar una venta pendiente (cambiar productos, sucursal de stock, envío o descuento) o cancelarla. Cancelar una venta restaura el stock vendido y revierte cualquier deuda que hubiera generado en cuenta corriente.',
      },
      {
        q: '¿Se puede vender sin stock disponible?',
        a: 'Por defecto no: el sistema valida el stock disponible en la sucursal elegida antes de confirmar la venta y avisa si no alcanza. Esto evita vender productos que en la práctica no existen en el local.',
      },
    ],
  },
  {
    id: 'facturacion',
    label: 'Facturación AFIP',
    icon: FacturacionIcon,
    entries: [
      {
        q: '¿La factura que emite el sistema es válida ante AFIP?',
        a: 'Sí. ComarPOS está integrado directo con los web services de AFIP/ARCA: cada comprobante obtiene un CAE real en el momento y se le agrega el código QR fiscal que exige la normativa, igual que un sistema de facturación tradicional.',
      },
      {
        q: '¿Qué pasa si AFIP no responde?',
        a: 'La venta no se pierde. Queda marcada como "pendiente de facturar" y un proceso automático (afipRetry) reintenta emitirla solo, en segundo plano, hasta lograr el CAE. No hace falta reintentar manualmente ni recargar la venta.',
      },
      {
        q: '¿Qué tipos de comprobante puedo emitir?',
        a: 'Factura (A, B o C según la condición de IVA del cliente y de tu negocio) y Nota de Crédito para anular o corregir un comprobante ya emitido. El tipo correcto se calcula automáticamente según quién compra.',
      },
      {
        q: '¿Cómo configuro mis datos fiscales (CUIT, punto de venta, certificados)?',
        a: 'Desde Configuración → ARCA / AFIP se cargan el CUIT, el punto de venta y los certificados de AFIP (homologación o producción). Es información sensible: se guarda encriptada, no en texto plano.',
      },
      {
        q: '¿Puedo reimprimir o volver a mandar una factura ya emitida?',
        a: 'Sí, desde Historial de Ventas o desde AFIP / Facturas se puede volver a descargar o imprimir el PDF de cualquier comprobante ya emitido, con su CAE y QR fiscal originales.',
      },
    ],
  },
  {
    id: 'libro-iva-digital',
    label: 'Libro IVA Digital',
    icon: FacturacionIcon,
    entries: [
      {
        q: '¿Qué es el Libro IVA Digital?',
        a: 'Es el régimen de AFIP/ARCA (RG 4597) que reemplazó al viejo CITI (RG 3685, ya derogado): todo Responsable Inscripto tiene que registrar mensualmente sus comprobantes de Ventas y Compras en el Portal IVA, antes de presentar la DDJJ de IVA. Desde Libro IVA Digital, en el menú, tenés las dos mitades listas para descargar.',
      },
      {
        q: '¿Tengo que subir el archivo de Ventas?',
        a: 'No hace falta. Como tus facturas ya se emiten con CAE real de AFIP, el organismo ya las tiene y las pre-carga solo en el Portal IVA. El export de Ventas que tenés acá es solo para tener todo junto, o para pasárselo a tu contador.',
      },
      {
        q: '¿Y el de Compras?',
        a: 'Ese sí hay que armarlo con lo que vos cargaste: para eso, cada compra necesita sus datos fiscales (CUIT del proveedor, tipo y número de comprobante, IVA por producto), que se completan al registrar la compra en Compras.',
      },
      {
        q: 'Me dice que hay compras con datos faltantes, ¿qué hago?',
        a: 'Ese aviso te lleva directo a Compras: entrá a esa compra y completá el tipo de comprobante, el punto de venta/número y el CUIT del proveedor que falten. Sin esos datos, esa compra no se puede reportar correctamente.',
      },
      {
        q: '¿El archivo que descargo lo puedo subir directo a AFIP?',
        a: 'Lo que se descarga es un CSV con los mismos datos y el mismo orden que exige AFIP para ese archivo, pensado para revisarlo o pasárselo a tu contador (o cargarlo en su software). El Portal IVA de AFIP pide un formato de texto de ancho fijo específico para la carga directa; por eso conviene confirmar con tu contador antes de la primera presentación.',
      },
    ],
  },
  {
    id: 'stock',
    label: 'Productos y Stock',
    icon: ProductosIcon,
    entries: [
      {
        q: '¿Cómo cargo un producto nuevo?',
        a: 'Desde Productos → Nuevo producto: nombre, categoría, precio, si se vende por unidad o por kilo, y el stock inicial por sucursal. Un producto también puede marcarse como compuesto (hecho de otros productos) para combos o kits.',
      },
      {
        q: '¿El stock es el mismo en todas las sucursales?',
        a: 'No, cada sucursal (o depósito) tiene su propio stock independiente. Un producto puede tener 10 unidades en un local y 3 en otro; las ventas y compras descuentan o suman stock solo en la sucursal elegida.',
      },
      {
        q: '¿Cómo sé si me estoy por quedar sin stock de algo?',
        a: 'La sección Alertas avisa automáticamente cuándo un producto llega a su stock mínimo configurado, para reponer antes de quedarte sin mercadería.',
      },
      {
        q: '¿Para qué sirve el Conteo de Stock?',
        a: 'Es la herramienta para hacer un inventario físico: contás la mercadería real del local y el sistema compara contra el stock cargado, mostrando las diferencias para ajustarlas.',
      },
      {
        q: '¿Cómo se mueve stock entre sucursales?',
        a: 'Se registra como un movimiento de stock indicando la sucursal de origen y destino. Cada movimiento queda en el historial de esa sucursal para poder auditarlo después.',
      },
    ],
  },
  {
    id: 'caja',
    label: 'Caja',
    icon: CajaIcon,
    entries: [
      {
        q: '¿Cómo abro y cierro la caja?',
        a: 'Desde Caja se abre indicando el monto inicial en efectivo. Al cerrar, el sistema muestra el total esperado según las ventas y pagos del día para que lo compares contra el efectivo real y hagas el arqueo.',
      },
      {
        q: '¿Puedo vender si la caja está cerrada?',
        a: 'Depende de la configuración de tu negocio, pero lo recomendado es siempre abrir la caja al empezar el turno: así todas las ventas en efectivo del día quedan asociadas a esa sesión de caja para el arqueo.',
      },
      {
        q: '¿Cómo imprimo el cierre de caja?',
        a: 'Al cerrar la caja podés generar e imprimir el comprobante de cierre (ticket) con el resumen del turno: ventas por medio de pago, total esperado y diferencia si la hubo.',
      },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes y Cuenta Corriente',
    icon: ClientesIcon,
    entries: [
      {
        q: '¿Cómo cargo un cliente?',
        a: 'Desde Clientes → Nuevo cliente, con sus datos de contacto y, si vas a facturarle Factura A, su CUIT y condición frente al IVA.',
      },
      {
        q: '¿Qué es la cuenta corriente de un cliente?',
        a: 'Es la posibilidad de venderle "a cuenta" (fiado) hasta un límite de crédito que vos definís. Cada venta a cuenta corriente suma deuda; cada pago que registra el cliente la descuenta. Desde Cuentas Corrientes se ve el saldo de cada uno.',
      },
      {
        q: '¿Cómo registro un pago de un cliente que debía?',
        a: 'Desde la ficha del cliente o desde Cuentas Corrientes se registra el pago (efectivo, transferencia, etc.), que se descuenta automáticamente de su saldo pendiente.',
      },
      {
        q: '¿Puedo tener listas de precio distintas por cliente?',
        a: 'Sí, un cliente puede tener asignada una lista de precios propia, para negocios que venden distinto (por ejemplo mayorista vs. minorista) según a quién le venden.',
      },
    ],
  },
  {
    id: 'servicios',
    label: 'Servicios (reparaciones)',
    icon: ServiciosIcon,
    entries: [
      {
        q: '¿Para qué sirve la sección Servicios?',
        a: 'Es para llevar el seguimiento de reparaciones o servicios técnicos: cada equipo que recibís (con su cliente, tipo, marca, modelo y falla reportada) queda como una orden de servicio, con su propio estado, presupuesto e historial hasta que se entrega.',
      },
      {
        q: '¿Cómo cargo una orden de servicio nueva?',
        a: 'Desde Servicios → Nueva orden: elegís el cliente (o lo creás en el momento si no está cargado) y cargás los datos del equipo (tipo, marca, modelo, número de serie, accesorios que dejó) y la falla reportada.',
      },
      {
        q: '¿Qué estados puede tener una orden?',
        a: 'Recibido → Presupuestado → Aprobado o Rechazado → En reparación → Listo para retirar → Entregado (o Cancelado en cualquier momento). El sistema solo permite pasar de un estado a los siguientes lógicos, no cualquier salto.',
      },
      {
        q: '¿Cómo presupuesto una reparación?',
        a: 'Dentro de la orden se cargan los ítems del presupuesto (productos del catálogo o ítems de texto libre, con cantidad, precio e IVA), y el total se calcula solo. Ahí la orden pasa a estado "Presupuestado".',
      },
      {
        q: '¿El cliente puede ver y aprobar el presupuesto sin venir al local?',
        a: 'Sí. Con "Compartir presupuesto" se genera un link único (también se puede mandar por WhatsApp) donde el cliente ve el detalle y lo aprueba o rechaza desde su celular, sin necesidad de cuenta ni de pasar por el local.',
      },
      {
        q: '¿Cómo se cobra y entrega una reparación terminada?',
        a: 'Cuando el equipo está "Listo para retirar", desde la orden se hace el cobro (eligiendo medio de pago y si corresponde ticket o factura) y al confirmarlo la orden pasa a "Entregado", igual que cerrar una venta desde el POS.',
      },
    ],
  },
  {
    id: 'hoteleria',
    label: 'Hotelería',
    icon: HoteleriaIcon,
    entries: [
      {
        q: '¿Para qué sirve la sección Hotelería?',
        a: 'Es para manejar habitaciones y reservas: cargás los tipos de habitación con su tarifa por noche, las habitaciones físicas de cada tipo, y reservás fechas para cada una viendo un calendario de disponibilidad.',
      },
      {
        q: '¿Cómo cargo las habitaciones?',
        a: 'Primero creás los "Tipos de habitación" (ej. Individual, Doble, Suite) con su tarifa por noche y capacidad, desde el botón "Tipos de habitación" en la pestaña Habitaciones. Después creás cada habitación física asignándole un tipo.',
      },
      {
        q: '¿Cómo hago una reserva?',
        a: 'Desde la pestaña Reservas, hacé click en una celda libre del calendario (habitación × día) o en "Nueva reserva". El sistema no deja reservar una habitación en fechas que ya están ocupadas por otra reserva.',
      },
      {
        q: '¿Qué estados puede tener una reserva y una habitación?',
        a: 'La reserva pasa de Reservada a Check-in hecho y después Check-out hecho (o Cancelada / No se presentó). La habitación en paralelo pasa de Libre a Ocupada al hacer check-in, y a Limpieza al cobrar el check-out — desde ahí se marca Libre a mano cuando está lista.',
      },
      {
        q: '¿Cómo se cobra una estadía?',
        a: 'Desde el detalle de la reserva, con "Cobrar" (eligiendo medio de pago y ticket o factura). Esto genera una venta normal que ya figura en Ventas, igual que cerrar una venta desde el POS.',
      },
    ],
  },
  {
    id: 'remitos',
    label: 'Remitos',
    icon: RemitosIcon,
    entries: [
      {
        q: '¿Qué es un remito en ComarPOS?',
        a: 'Es el comprobante de entrega de mercadería, con su propio CAI (Código de Autorización de Impresión) de AFIP, separado de la factura. Sirve para acompañar un envío o entrega sin necesidad de facturar en el momento.',
      },
      {
        q: '¿Cómo genero un remito?',
        a: 'Desde Remitos → Nuevo remito, cargando el cliente y los productos a entregar, igual que armarías una venta. El remito se puede imprimir o descargar en PDF con su numeración oficial.',
      },
    ],
  },
  {
    id: 'devoluciones',
    label: 'Devoluciones',
    icon: DevolucionesIcon,
    entries: [
      {
        q: '¿Cómo hago una devolución de una venta?',
        a: 'Desde Devoluciones, elegís la venta original y los productos que el cliente devuelve. El sistema restaura ese stock, revierte la deuda o el pago según corresponda, y guarda el motivo de la devolución y el medio de reintegro.',
      },
      {
        q: '¿La devolución emite una nota de crédito automáticamente?',
        a: 'Si la venta original estaba facturada, la devolución genera (o te guía para generar) la nota de crédito correspondiente ante AFIP, para que el comprobante fiscal quede consistente con lo que realmente se vendió.',
      },
    ],
  },
  {
    id: 'compras',
    label: 'Compras y Proveedores',
    icon: ComprasIcon,
    entries: [
      {
        q: '¿Para qué sirve la sección Compras?',
        a: 'Para registrar lo que le comprás a tus proveedores: al cargar una compra, el stock de los productos comprados se suma automáticamente en la sucursal que elijas.',
      },
      {
        q: '¿Qué es una Orden de Compra?',
        a: 'Es el paso previo a la compra: un pedido formal a un proveedor con los productos y cantidades que necesitás reponer, antes de que la mercadería llegue y se registre como Compra.',
      },
      {
        q: '¿Cómo cargo un proveedor nuevo?',
        a: 'Desde Proveedores → Nuevo proveedor, con sus datos de contacto. Después se lo puede asociar a las compras y órdenes de compra que le hagas.',
      },
    ],
  },
  {
    id: 'finanzas-reportes',
    label: 'Finanzas y Reportes',
    icon: FinanzasIcon,
    entries: [
      {
        q: '¿Qué maneja la sección Finanzas?',
        a: 'Ingresos y egresos de dinero del negocio que no son una venta ni una compra (por ejemplo pagos de servicios), y también los Gastos Recurrentes: gastos fijos que se repiten todos los meses, para no tener que cargarlos a mano cada vez.',
      },
      {
        q: '¿Qué reportes tiene el sistema?',
        a: 'Reportes gerenciales de ventas por vendedor, por hora y por sucursal, y de rentabilidad por producto y por categoría, para entender qué se vende más y qué deja más margen sin armar una planilla aparte.',
      },
      {
        q: '¿Para qué sirven los Objetivos de Venta?',
        a: 'Para fijar una meta de ventas (por ejemplo mensual) y hacer seguimiento de cuánto falta para alcanzarla, con el progreso actualizado a medida que se cargan ventas.',
      },
      {
        q: '¿Y el Tipo de Cambio?',
        a: 'Si trabajás con precios o costos en otra moneda, ahí se configura la cotización que usa el sistema para los cálculos, para no tener que convertir a mano.',
      },
    ],
  },
  {
    id: 'promos-fidelidad',
    label: 'Promociones y Fidelidad',
    icon: PromocionesIcon,
    entries: [
      {
        q: '¿Cómo armo una promoción o descuento?',
        a: 'Desde Promociones se configuran descuentos (por producto, categoría o el total de la venta), con la vigencia que quieras. Se aplican automáticamente al vender mientras estén activos.',
      },
      {
        q: '¿Cómo funciona la fidelización por puntos?',
        a: 'Cada compra de un cliente puede sumar puntos según lo que configures, y esos puntos se pueden canjear después. Todo se ve desde la sección Fidelidad.',
      },
    ],
  },
  {
    id: 'usuarios-sucursales',
    label: 'Usuarios y Sucursales',
    icon: UsuariosIcon,
    entries: [
      {
        q: '¿Qué roles de usuario existen?',
        a: 'Administrador (acceso total, incluida la configuración del negocio), Empleado (uso operativo: POS, ventas, stock, caja), y roles especiales como Contador (pensado para acceso a información contable/fiscal) y Cliente (para el acceso self-service de un cliente a su propia cuenta, si aplica).',
      },
      {
        q: '¿Cómo agrego un usuario nuevo a mi equipo?',
        a: 'Desde Usuarios (solo visible para Administradores) → Nuevo usuario, indicando su email, nombre y rol. Cada usuario inicia sesión con su propio email y contraseña.',
      },
      {
        q: '¿Cómo agrego una sucursal nueva?',
        a: 'Desde Configuración → Sucursales → Nueva sucursal. A partir de ahí esa sucursal tiene su propio stock y caja, y aparece como opción al vender, comprar o mover stock.',
      },
      {
        q: '¿Hay límite de usuarios o sucursales?',
        a: 'No, el plan de ComarPOS incluye usuarios y sucursales sin límite: podés sumar los que necesites a medida que crece tu negocio, sin costo extra ni migrar de sistema.',
      },
    ],
  },
  {
    id: 'printbox',
    label: 'PrintBox (impresora)',
    icon: PrintboxIcon,
    entries: [
      {
        q: '¿Qué es PrintBox?',
        a: 'Es un dispositivo (basado en ESP32) que conectás a tu impresora térmica para imprimir tickets de venta y cierres de caja directo desde ComarPOS, sin necesidad de una PC conectada por cable a la impresora.',
      },
      {
        q: '¿Cómo vinculo un PrintBox a mi negocio?',
        a: 'Desde Configuración → PrintBox se empareja el dispositivo con tu cuenta. Una vez vinculado, podés elegir esa impresora como destino al imprimir tickets desde el POS o el cierre de caja.',
      },
      {
        q: 'Configuré el logo pero no sale bien en el ticket, ¿por qué?',
        a: 'El logo se convierte automáticamente a blanco y negro (rasterizado) para que la impresora térmica lo pueda imprimir; imágenes con mucho detalle o poco contraste pueden perder nitidez en ese proceso. Probá con un logo simple y de buen contraste.',
      },
    ],
  },
  {
    id: 'suscripcion',
    label: 'Suscripción y pagos',
    icon: CreditCard as unknown as HelpIconComponent,
    entries: [
      {
        q: '¿Cuánto cuesta ComarPOS?',
        a: 'Hay un único plan, con todo incluido (ventas, facturación AFIP, stock, caja, reportes, usuarios y sucursales sin límite). El precio de lanzamiento queda fijo de por vida para quien se suscribe durante el período de lanzamiento.',
      },
      {
        q: '¿Cómo pago la suscripción?',
        a: 'El pago mensual se hace con Mercado Pago desde la sección de suscripción de tu cuenta. Una vez acreditado el pago, el sistema queda activo para el siguiente período.',
      },
      {
        q: '¿Qué pasa si no pago a tiempo?',
        a: 'Si la suscripción queda vencida o suspendida, el sistema bloquea el acceso operativo hasta regularizar el pago. Los datos cargados no se pierden: apenas se reactiva la suscripción, volvés a entrar normalmente.',
      },
    ],
  },
  {
    id: 'celular-pwa',
    label: 'Celular / App (PWA)',
    icon: Smartphone as unknown as HelpIconComponent,
    entries: [
      {
        q: '¿Cómo instalo ComarPOS en el celular?',
        a: 'Abrí ComarPOS desde el navegador del celular y usá la opción "Agregar a pantalla de inicio" (Chrome/Android) o "Compartir → Agregar a inicio" (Safari/iPhone). Queda como un ícono más, sin pasar por Google Play ni App Store.',
      },
      {
        q: '¿Funciona igual en celular que en la computadora?',
        a: 'Sí, es el mismo sistema con una interfaz que se adapta a la pantalla: en el celular el menú principal se accede desde la barra inferior en vez de la barra lateral, pero todas las funciones están disponibles.',
      },
      {
        q: '¿Necesito internet para usarlo?',
        a: 'Sí, ComarPOS es un sistema online: necesita conexión a internet para vender, facturar y sincronizar el stock. No está pensado para funcionar completamente offline.',
      },
    ],
  },
];

export function normalizeForSearch(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
}
