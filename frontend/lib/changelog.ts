// Historial de versiones visible para los usuarios (Ayuda → Historial de
// versiones y el link del modal de Novedades). Redactado para el negocio, no
// para desarrolladores: qué cambió y para qué sirve. La primera entrada es la
// más nueva -- al anunciar una novedad, agregala arriba y actualizá
// LATEST_ID en components/WhatsNewModal.tsx.

export type ChangelogSection = { title: string; items: string[] };
export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.7',
    date: '2026-10-23',
    title: 'Contador en varios negocios, sacar stock y etiquetas',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Usuario Contador: en Usuarios podés crearle una cuenta a tu contador. Solo ve el reporte Contador y las facturas, no vende y no ocupa un usuario de tu plan.',
          'Un mismo contador puede trabajar para varios negocios con una sola cuenta: si ya usa ComarPOS, en Usuarios → Contador poné solo su email. Cambia de negocio desde el menú y, al volver a entrar, arranca en el último que usó.',
          'Cada negocio puede desactivar o quitarle el acceso al contador cuando quiera, sin afectar su cuenta ni sus otros negocios.',
          'Sacar stock: en Stock → Movimiento elegí "Egreso (sacar stock)" para registrar roturas, vencimientos o consumo interno, con motivo obligatorio.',
          'Códigos de barra: filtro por proveedor para imprimir de una las etiquetas de lo que te llegó.',
          'Agente de impresión para PCs con Windows 7 u 8 (link en Configuración → PrintBox).',
        ],
      },
      {
        title: 'Mejoras',
        items: [
          'Etiquetas: el nombre del producto ahora se ve grande y en negrita; el número del código queda chico debajo de las barras.',
          'Los SKU quedan solo con letras y números (sin guiones ni puntos), porque algunos lectores de códigos leían mal esos caracteres. Se actualizaron los ya cargados y las etiquetas viejas se siguen escaneando bien.',
          'Compras: además de los productos del proveedor elegido podés agregar cualquier otro producto, el IVA se toma del producto y si pegás "0003-00012345" se separa solo en punto de venta y número.',
          'Listas de precios: se ve el precio de cada producto en la lista y se avisa cuando hay más productos que los mostrados.',
          'Reporte Contador: con multi-facturación muestra el dueño de cada comprobante, y para un dueño Monotributo no calcula liquidación de IVA.',
        ],
      },
      {
        title: 'Correcciones',
        items: [
          'POS: si elegías el cliente o la lista de precios después de cargar los productos, se cobraba el precio Minorista. Ahora se recalcula el carrito.',
          'En pantallas chicas (1024 o 1366 px, típicas de PCs viejas) la parte derecha quedaba cortada, por ejemplo el carrito del POS.',
        ],
      },
    ],
  },
  {
    version: '2.6',
    date: '2026-10-20',
    title: 'Variantes de producto',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Variantes de producto: un mismo producto puede tener talles, colores, sabores, molienda, etc. Cada combinación tiene su SKU, precio, foto y stock por sucursal.',
          'Precio y costo generales que se copian a todas las variantes, con la opción de personalizar una y "volver al precio general".',
          'Botón "Convertir a producto con variantes" para productos ya cargados: convertirlo en la primera variante (conserva stock e historial) o empezar de cero.',
          'POS, cotizaciones, edición de ventas y cambios en devoluciones con selector de variantes; escanear el código de una variante la agrega directo.',
          'Compras y órdenes de compra: cargar cantidades de varias variantes de una vez, con opción de actualizar el costo general.',
          'Stock y conteo por variante, con "mínimo para todas las variantes" por sucursal.',
          'Tienda online: el cliente elige talle y color; las combinaciones sin stock aparecen deshabilitadas.',
          'Reportes: ver por variante o agrupar por producto. Los Excel incluyen las columnas Producto padre y Variante.',
          'Listas de precios con "mismo precio para todas las variantes" y promociones que se aplican a todas las variantes de un producto.',
          'Códigos de barra: una etiqueta por variante con el nombre del producto y la variante.',
        ],
      },
      {
        title: 'Correcciones',
        items: [
          'Las ventas guardaban siempre IVA 21%: ahora se guarda la alícuota real de cada producto (10,5%, 27%, exento…), también en reparaciones, hotelería y pedidos de la tienda.',
          'El POS no dejaba vender productos compuestos (combos): ahora el stock disponible se calcula a partir de sus componentes.',
          'Facturas, tickets y notas de crédito muestran el nombre del producto tal como se vendió.',
        ],
      },
    ],
  },
  {
    version: '2.5',
    date: '2026-09-12',
    title: 'POS más rápido para escanear y cobrar',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Escaneo continuo al carrito, con la cámara o con un lector físico, sin tener que hacer clic en el buscador.',
          'Enter con el buscador vacío abre el cobro rápido (medio de pago + ticket).',
          'La promoción automática se muestra antes de confirmar la venta.',
          'Tamaño de etiqueta (chico, mediano, grande) al descargar códigos de barra, con opción de aplicarlo a todos.',
        ],
      },
      {
        title: 'Correcciones',
        items: [
          'El POS dejaba cargar más unidades que el stock disponible.',
          'El ticket se imprimía sin número después de confirmar la venta.',
        ],
      },
    ],
  },
  {
    version: '2.4',
    date: '2026-09-11',
    title: 'Multi-facturación y códigos de barra',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Multi-facturación: hasta 4 CUIT por negocio, eligiendo con cuál facturar cada venta o compra.',
          'SKU automático si no se carga uno al crear un producto.',
          'Módulo de códigos de barra: PDF con etiquetas listas para imprimir o Excel con los códigos.',
          'Sacar la foto del producto con la cámara del celular; formulario de producto a pantalla completa en mobile.',
          'La sesión dura 30 días.',
        ],
      },
    ],
  },
  {
    version: '2.3',
    date: '2026-09-08',
    title: 'Cobro con vuelto y PrintBox',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Modal de cobro con cálculo de vuelto (se activa por negocio).',
          'Agregar stock desde Productos, dejando registrado el movimiento.',
          'PrintBox: actualizaciones de firmware automáticas.',
        ],
      },
    ],
  },
  {
    version: '2.2',
    date: '2026-09-03',
    title: 'Compras, proveedores y tienda online',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'POS con vista en grilla o en tabla.',
          'Stock inicial y stock mínimo al crear un producto.',
          'Proveedores vinculados a sus productos y aumento de precios en bloque (costo, venta o ambos).',
          'Órdenes de compra completas: pedir, recibir y generar la compra.',
          'Tienda online: cuenta obligatoria del comprador, búsqueda por código de barras y checkout por WhatsApp.',
        ],
      },
      {
        title: 'Correcciones',
        items: ['Alertas y stock mínimo de productos por kilo en POS, Stock y notificaciones.'],
      },
    ],
  },
  {
    version: '2.1',
    date: '2026-09-01',
    title: 'Tienda online propia',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Tienda online por negocio: catálogo público, pedidos y cobro con tu propia cuenta de Mercado Pago.',
          'Listas de precios y cotizaciones con varios descuentos.',
          'Guía de arranque para configurar el negocio paso a paso.',
          'Puntos de venta separados por usuario (cada empleado vende desde su sucursal).',
          'Elección del rubro al crear la cuenta, con categorías y productos de ejemplo.',
        ],
      },
    ],
  },
  {
    version: '2.0',
    date: '2026-08-27',
    title: 'Hotelería y mejoras mobile',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Módulo de Hotelería: habitaciones, tarifas, calendario de reservas y check-in/check-out.',
          'Productos "sin stock" que siempre se pueden vender, sin controlar ni descontar stock.',
          'Navegación mobile renovada (panel "Más") y POS mobile rediseñado.',
        ],
      },
      {
        title: 'Correcciones',
        items: ['Recargos (descuentos negativos) en reportes y cotizaciones.'],
      },
    ],
  },
  {
    version: '1.9',
    date: '2026-08-26',
    title: 'Libro IVA Digital y finanzas',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Libro IVA Digital con ventas, compras y liquidación de IVA mensual.',
          'Estado de Resultados (P&L) mensual.',
          'Cuenta corriente de proveedores y plan de cuentas configurable.',
          'Devoluciones eligiendo ítems, con cambio por otro producto y saldo a favor del cliente.',
          'Datos fiscales del comprobante en las compras.',
        ],
      },
    ],
  },
  {
    version: '1.8',
    date: '2026-08-25',
    title: 'Servicios y reparaciones',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Módulo de Servicios/Reparaciones con presupuesto en PDF e IVA discriminado por ítem.',
          'Agente de escritorio (ComarPOS Agent) para imprimir tickets desde la compu.',
          'Alta rápida de clientes desde cualquier buscador (solo el nombre es obligatorio).',
          'Razón social separada del nombre de fantasía, con autocompletado desde ARCA.',
          'Los remitos piden un CAI activo antes de crearse.',
        ],
      },
    ],
  },
  {
    version: '1.7',
    date: '2026-08-24',
    title: 'Sucursales y comprobantes',
    sections: [
      {
        title: 'Nuevo',
        items: [
          'Sucursales y depósitos ilimitados (antes eran solo Local y Depósito).',
          'Descargar la factura en PDF desde Ventas y notas de crédito en el historial.',
          'Nuevo formato de ticket; la Factura A discrimina el IVA por alícuota.',
          'Notificaciones push, modo oscuro renovado y accesos rápidos del menú mobile personalizables.',
        ],
      },
    ],
  },
];

export const formatChangelogDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
