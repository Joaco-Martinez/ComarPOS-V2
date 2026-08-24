import {
  ShoppingBag, PawPrint, Wrench, Cpu, Candy, Shirt, Hammer, Truck, Pill, BookOpen, Wine, Sparkles,
  Barcode, Bell, Zap, Layers, Wallet, MapPin, ClipboardList, FileText, Clock, Boxes, CreditCard,
  TrendingUp, Gift, Percent, Tag,
  type LucideIcon,
} from 'lucide-react';

export type VerticalFeature = {
  icon: LucideIcon;
  title: string;
  desc: string;
};

export type Vertical = {
  slug: string;
  icon: LucideIcon;
  label: string;
  /** Palabra/frase que reemplaza "tu negocio" en el título, ya con género/artículo resuelto. */
  headline: string;
  heroDescription: string;
  problemTitle: string;
  problemDescription: string;
  tags: string[];
  features: VerticalFeature[];
};

export const VERTICALS: Vertical[] = [
  {
    slug: 'kioscos-y-almacenes',
    icon: ShoppingBag,
    label: 'Kioscos y almacenes',
    headline: 'kiosco o almacén',
    heroDescription: 'ComarPOS cobra con lector de código de barras, controla el stock de cientos de productos y factura sin perder tiempo en el mostrador.',
    problemTitle: 'Pensado para kioscos y almacenes',
    problemDescription: 'Entre las 8 y las 21 no para de entrar gente y cada segundo en el mostrador cuenta. ComarPOS cobra con lector de código de barras, controla el stock de cientos de productos a la vez y te avisa antes de que te quedes sin las cosas que más se venden.',
    tags: ['Código de barras', 'Alertas de stock bajo', 'Venta rápida', 'Multi-caja'],
    features: [
      { icon: Barcode, title: 'Cobrás con lector de código de barras', desc: 'Escaneás el producto y el precio sale solo, sin buscarlo en ninguna lista.' },
      { icon: Bell, title: 'Alertas antes de quedarte sin stock', desc: 'El sistema te avisa cuando un producto está por agotarse, para reponer a tiempo.' },
      { icon: Zap, title: 'Venta rápida en el mostrador', desc: 'Cobrás en segundos, hasta en los momentos de más movimiento.' },
      { icon: Layers, title: 'Multi-caja', desc: 'Varias cajas o puntos de venta trabajando al mismo tiempo, sin pisarse.' },
    ],
  },
  {
    slug: 'veterinarias',
    icon: PawPrint,
    label: 'Veterinarias',
    headline: 'veterinaria',
    heroDescription: 'ComarPOS junta productos y servicios en una sola venta, lleva la cuenta corriente de tus clientes frecuentes y factura todo.',
    problemTitle: 'Pensado para veterinarias',
    problemDescription: 'Vendés alimento balanceado, medicamentos y también servicios como consultas o baños, muchas veces al mismo cliente de siempre. ComarPOS junta todo en una sola venta, lleva la cuenta corriente de los clientes habituales y te avisa cuando un producto está por agotarse.',
    tags: ['Productos + servicios en una venta', 'Cuenta corriente de clientes', 'Alertas de stock', 'Multi-sucursal'],
    features: [
      { icon: Layers, title: 'Productos y servicios en una sola venta', desc: 'Cobrás el alimento balanceado y la consulta juntos, en un solo ticket.' },
      { icon: Wallet, title: 'Cuenta corriente de clientes', desc: 'Llevás el saldo de tus clientes frecuentes sin usar una libreta aparte.' },
      { icon: Bell, title: 'Alertas de stock', desc: 'Te avisa cuándo reponer antes de quedarte sin lo que más se vende.' },
      { icon: MapPin, title: 'Multi-sucursal', desc: 'Si tenés más de un local, cada uno con su propio stock y caja.' },
    ],
  },
  {
    slug: 'talleres-mecanicos',
    icon: Wrench,
    label: 'Talleres mecánicos',
    headline: 'taller',
    heroDescription: 'ComarPOS arma el presupuesto con repuestos y mano de obra, factura el trabajo terminado y guarda el historial de cada cliente.',
    problemTitle: 'Pensado para talleres mecánicos',
    problemDescription: 'Cada trabajo mezcla repuestos, mano de obra y, muchas veces, la promesa de "te lo facturo cuando lo retirás". ComarPOS arma el presupuesto, lo convierte en factura cuando el auto sale del taller y guarda el historial de cada cliente para la próxima visita.',
    tags: ['Presupuestos', 'Factura al entregar', 'Historial por cliente', 'Cuenta corriente'],
    features: [
      { icon: ClipboardList, title: 'Presupuestos', desc: 'Armás el presupuesto con repuestos y mano de obra antes de arrancar el trabajo.' },
      { icon: FileText, title: 'Factura al entregar', desc: 'Convertís el presupuesto en factura en el momento en que el auto sale del taller.' },
      { icon: Clock, title: 'Historial por cliente', desc: 'Guardás cada trabajo hecho, para saber qué se le hizo a cada auto y cuándo.' },
      { icon: Wallet, title: 'Cuenta corriente', desc: 'Para los clientes que pagan cuando retiran, sin perder el registro.' },
    ],
  },
  {
    slug: 'electronica',
    icon: Cpu,
    label: 'Electrónica',
    headline: 'local de electrónica',
    heroDescription: 'ComarPOS controla el stock por producto, acepta distintos medios de pago y factura cada venta con AFIP en el momento.',
    problemTitle: 'Pensado para locales de electrónica',
    problemDescription: 'Cada producto tiene su propio margen y a veces una garantía que hay que poder rastrear. ComarPOS controla el stock producto por producto, te deja vender con distintos medios de pago (efectivo, tarjeta, cuenta corriente) y factura todo con AFIP en el momento.',
    tags: ['Control de stock por producto', 'Múltiples medios de pago', 'Cuenta corriente', 'Reportes de ventas'],
    features: [
      { icon: Boxes, title: 'Control de stock por producto', desc: 'Sabés cuánto tenés de cada modelo, en tiempo real.' },
      { icon: CreditCard, title: 'Múltiples medios de pago', desc: 'Efectivo, tarjeta o cuenta corriente, todo desde la misma venta.' },
      { icon: Wallet, title: 'Cuenta corriente', desc: 'Para tus clientes habituales o mayoristas.' },
      { icon: TrendingUp, title: 'Reportes de ventas', desc: 'Mirás qué productos rotan más y cuáles conviene dejar de pedir.' },
    ],
  },
  {
    slug: 'chocolaterias-y-golosinas',
    icon: Candy,
    label: 'Chocolaterías y golosinas',
    headline: 'chocolatería',
    heroDescription: 'ComarPOS vende por unidad o por combo, controla el stock de cada producto y factura rápido en los días de más movimiento.',
    problemTitle: 'Pensado para chocolaterías y golosinas',
    problemDescription: 'San Valentín, Pascuas o el Día del Niño te llenan el local y no podés perder tiempo cobrando. ComarPOS vende por unidad o por combo, controla el stock de cada producto y factura rápido, hasta en los días de más movimiento.',
    tags: ['Venta por unidad o combo', 'Control de stock', 'Venta rápida', 'Promociones'],
    features: [
      { icon: Gift, title: 'Venta por unidad o combo', desc: 'Armás cajas y combos para fechas especiales sin complicarte.' },
      { icon: Boxes, title: 'Control de stock', desc: 'Sabés qué te queda de cada producto, incluso en temporada alta.' },
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás rápido en los días de más gente en el local.' },
      { icon: Percent, title: 'Promociones', desc: 'Definís descuentos por fecha o por producto sin tocar el precio de lista.' },
    ],
  },
  {
    slug: 'indumentaria',
    icon: Shirt,
    label: 'Indumentaria',
    headline: 'local de indumentaria',
    heroDescription: 'ComarPOS controla el stock por talle y color, y te deja tener un precio para el mostrador y otro para tus clientes mayoristas.',
    problemTitle: 'Pensado para locales de indumentaria',
    problemDescription: 'Un mismo modelo se vende en varios talles y colores, y a veces le vendés al público y a veces por mayor. ComarPOS controla el stock de cada variante, te deja tener un precio para el mostrador y otro para tus clientes mayoristas, y factura todo con AFIP.',
    tags: ['Precio mayorista y minorista', 'Control de stock', 'Promociones', 'Multi-sucursal'],
    features: [
      { icon: Tag, title: 'Precio mayorista y minorista', desc: 'Un precio para el mostrador y otro distinto para tus clientes mayoristas.' },
      { icon: Boxes, title: 'Control de stock por talle y color', desc: 'Sabés qué variante de cada modelo te queda.' },
      { icon: Percent, title: 'Promociones', desc: 'Descuentos por temporada o liquidación, fáciles de armar.' },
      { icon: MapPin, title: 'Multi-sucursal', desc: 'Cada local con su propio stock, comparables desde un mismo reporte.' },
    ],
  },
  {
    slug: 'ferreterias',
    icon: Hammer,
    label: 'Ferreterías',
    headline: 'ferretería',
    heroDescription: 'ComarPOS controla el stock de cientos de artículos chicos, te avisa cuándo reponer y factura cada venta en segundos.',
    problemTitle: 'Pensado para ferreterías',
    problemDescription: 'Entre tornillos, caños y pintura tenés cientos de productos distintos, cada uno con su propio margen y proveedor. ComarPOS controla el stock de todos ellos, te avisa cuándo reponer y factura cada venta en segundos.',
    tags: ['Cientos de productos', 'Alertas de reposición', 'Venta rápida', 'Proveedores y compras'],
    features: [
      { icon: Boxes, title: 'Cientos de productos', desc: 'Organizás tornillos, caños, pintura y todo lo demás sin perderte.' },
      { icon: Bell, title: 'Alertas de reposición', desc: 'Te avisa cuándo un artículo está por agotarse.' },
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás rápido, aunque el ticket tenga muchos ítems distintos.' },
      { icon: Truck, title: 'Proveedores y compras', desc: 'Registrás tus compras y mantenés el costo de cada producto actualizado.' },
    ],
  },
  {
    slug: 'distribuidoras',
    icon: Truck,
    label: 'Distribuidoras',
    headline: 'distribuidora',
    heroDescription: 'ComarPOS controla el stock en más de un depósito, arma remitos para cada entrega y lleva el saldo de cada cliente al día.',
    problemTitle: 'Pensado para distribuidoras',
    problemDescription: 'Vendés por mayor, entregás en varios puntos y muchos clientes te pagan a cuenta corriente. ComarPOS controla el stock en más de una ubicación, arma remitos para cada entrega y lleva el saldo de cada cliente al día.',
    tags: ['Multi-depósito', 'Remitos', 'Cuenta corriente', 'Reparto y envíos'],
    features: [
      { icon: MapPin, title: 'Multi-depósito', desc: 'Controlás el stock en más de una ubicación al mismo tiempo.' },
      { icon: FileText, title: 'Remitos', desc: 'Generás el remito de cada entrega, listo para el repartidor.' },
      { icon: Wallet, title: 'Cuenta corriente', desc: 'El saldo de cada cliente, siempre al día.' },
      { icon: Truck, title: 'Reparto y envíos', desc: 'Organizás qué sale a entregar y a quién.' },
    ],
  },
  {
    slug: 'farmacias',
    icon: Pill,
    label: 'Farmacias',
    headline: 'farmacia',
    heroDescription: 'ComarPOS controla el stock producto por producto, acepta efectivo, tarjeta y cuenta corriente, y emite la factura al instante.',
    problemTitle: 'Pensado para farmacias',
    problemDescription: 'Necesitás cobrar rápido, saber qué tenés en stock antes de que se corte y que cada venta quede facturada. ComarPOS controla el stock producto por producto, acepta efectivo, tarjeta y cuenta corriente, y emite la factura con CAE al instante.',
    tags: ['Venta rápida', 'Alertas de stock', 'Múltiples medios de pago', 'Reportes'],
    features: [
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás en segundos, sin hacer esperar a nadie.' },
      { icon: Bell, title: 'Alertas de stock', desc: 'Sabés antes de que se corte un producto.' },
      { icon: CreditCard, title: 'Múltiples medios de pago', desc: 'Efectivo, tarjeta o cuenta corriente.' },
      { icon: TrendingUp, title: 'Reportes', desc: 'Mirás qué se vendió, cuándo y cuánto dejó cada día.' },
    ],
  },
  {
    slug: 'librerias',
    icon: BookOpen,
    label: 'Librerías',
    headline: 'librería',
    heroDescription: 'ComarPOS arma combos para la vuelta al cole, controla el stock de todo lo que vendés y factura rápido en los días de más gente.',
    problemTitle: 'Pensado para librerías',
    problemDescription: 'Marzo te explota de gente con la lista escolar en la mano, y el resto del año necesitás controlar igual cada lápiz y cada cuaderno. ComarPOS arma combos, controla el stock de todo lo que vendés y factura rápido, hasta en los días de más movimiento.',
    tags: ['Combos y promociones', 'Control de stock', 'Venta rápida', 'Reportes por temporada'],
    features: [
      { icon: Gift, title: 'Combos y promociones', desc: 'Armás combos para la vuelta al cole sin calcular nada a mano.' },
      { icon: Boxes, title: 'Control de stock', desc: 'Sabés qué cuaderno, lápiz o mochila te queda.' },
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás rápido en los días de más movimiento.' },
      { icon: TrendingUp, title: 'Reportes por temporada', desc: 'Comparás marzo con el resto del año y planificás mejor la próxima.' },
    ],
  },
  {
    slug: 'vinotecas',
    icon: Wine,
    label: 'Vinotecas',
    headline: 'vinoteca',
    heroDescription: 'ComarPOS controla el stock por etiqueta, te deja armar combos de regalo y factura cada venta sin hacer esperar al cliente.',
    problemTitle: 'Pensado para vinotecas',
    problemDescription: 'Cada etiqueta es un producto distinto, con su propia añada y su propio margen. ComarPOS controla el stock de cada una, te deja armar combos para regalo y factura todo en el momento, sin perder tiempo con el cliente esperando.',
    tags: ['Control por etiqueta', 'Combos de regalo', 'Venta rápida', 'Reportes'],
    features: [
      { icon: Boxes, title: 'Control por etiqueta', desc: 'Cada vino es un producto distinto, con su propio stock y margen.' },
      { icon: Gift, title: 'Combos de regalo', desc: 'Armás cajas y combos para regalo sin perder el control del stock.' },
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás rápido, sin hacer esperar al cliente.' },
      { icon: TrendingUp, title: 'Reportes', desc: 'Mirás qué etiquetas rotan más.' },
    ],
  },
  {
    slug: 'perfumerias',
    icon: Sparkles,
    label: 'Perfumerías',
    headline: 'perfumería',
    heroDescription: 'ComarPOS controla el stock por producto y marca, te avisa cuándo reponer y factura cada venta con AFIP en el momento.',
    problemTitle: 'Pensado para perfumerías',
    problemDescription: 'Manejás muchas marcas y productos distintos, con clientes que vuelven siempre a buscar lo mismo. ComarPOS controla el stock de cada producto, te avisa cuándo reponer y factura cada venta con AFIP en el momento.',
    tags: ['Control de stock por producto', 'Alertas de reposición', 'Venta rápida', 'Cuenta corriente'],
    features: [
      { icon: Boxes, title: 'Control de stock por producto', desc: 'Sabés cuánto tenés de cada marca y producto.' },
      { icon: Bell, title: 'Alertas de reposición', desc: 'Te avisa cuándo reponer antes de quedarte sin stock.' },
      { icon: Zap, title: 'Venta rápida', desc: 'Cobrás rápido en el mostrador.' },
      { icon: Wallet, title: 'Cuenta corriente', desc: 'Para tus clientes frecuentes.' },
    ],
  },
];

export function getVerticalBySlug(slug: string): Vertical | undefined {
  return VERTICALS.find((v) => v.slug === slug);
}
