const QRCode = require('qrcode');

// Arma el HTML del ticket a partir del mismo payload JSON que ya recibe el
// firmware del ESP32 (ver buildTicketPayload en backend/src/services/ticket.service.ts)
// -- incluye exactamente los mismos campos, asi que el contenido impreso es
// consistente entre un PrintBox fisico y este agente. La diferencia es la
// via: el ESP32 arma comandos ESC/POS byte a byte; acá se imprime HTML
// normal a traves del driver de Windows de la impresora ya instalada (mas
// robusto entre marcas/modelos que reimplementar ESC/POS a mano, ver
// desktop-agent/README.md).
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(n) {
  return Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function line() {
  return '<div class="dashed"></div>';
}

function renderItems(items) {
  return (items || [])
    .map((it) => {
      const qty = it.quantityKg !== undefined ? `${it.quantityKg} kg` : `${it.quantity}`;
      return `
        <div class="item">
          <div class="item-name">${esc(it.name)}</div>
          <div class="item-row">
            <span>${esc(qty)} x $${money(it.price)}</span>
            <span>$${money(it.subtotal)}</span>
          </div>
        </div>`;
    })
    .join('');
}

function renderShipping(shipping) {
  if (!shipping) return '';
  const addr = shipping.fullAddress || [shipping.street, shipping.number].filter(Boolean).join(' ');
  return `
    ${line()}
    <div class="section-title">ENVIO</div>
    ${shipping.method ? `<div>${esc(shipping.method)}${shipping.status ? ` - ${esc(shipping.status)}` : ''}</div>` : ''}
    ${shipping.receiverName ? `<div>Destinatario: ${esc(shipping.receiverName)}</div>` : ''}
    ${shipping.receiverPhone ? `<div>Tel: ${esc(shipping.receiverPhone)}</div>` : ''}
    ${addr ? `<div>${esc(addr)}${shipping.city ? `, ${esc(shipping.city)}` : ''}</div>` : ''}
    ${shipping.notes ? `<div>Notas: ${esc(shipping.notes)}</div>` : ''}
  `;
}

async function renderInvoice(invoice) {
  if (!invoice) return '';
  let qrImg = '';
  if (invoice.qrUrl) {
    try {
      const dataUrl = await QRCode.toDataURL(invoice.qrUrl, { margin: 0, width: 220 });
      qrImg = `<div class="qr"><img src="${dataUrl}" width="140" height="140" /></div>`;
    } catch {
      // Si falla la generacion del QR, seguimos sin el -- no vale la pena
      // fallar la impresion entera del ticket por esto (mismo criterio que
      // el firmware: no-fatal, ver printbox/README.md).
    }
  }
  return `
    ${line()}
    <div class="center bold">Cod. ${esc(invoice.codigo)} - Nro ${esc(invoice.numero)}</div>
    <div class="center">CAE: ${esc(invoice.cae)}</div>
    ${invoice.caeVto ? `<div class="center">Vto CAE: ${esc(invoice.caeVto)}</div>` : ''}
    ${qrImg}
  `;
}

// 58mm de rollo -> ~48mm de area imprimible real (el resto son margenes
// mecanicos del cabezal); 80mm de rollo -> ~72mm. Son los dos anchos
// estandar de impresora termica de ticket -- si se manda contenido mas
// ancho que el rollo fisico, el driver de Windows puede rechazar el
// trabajo entero en vez de recortarlo (reproducido: PrintboxDevice
// configurado con una POS-58C -- 58mm -- mientras el HTML pedia 76mm,
// el trabajo se enviaba pero nunca imprimia nada).
function contentWidthMm(paperWidthMm) {
  return paperWidthMm === 58 ? 48 : 72;
}

async function buildTicketHtml(payload, paperWidthMm = 80) {
  const p = payload || {};
  const business = p.business || {};
  const client = p.client || {};
  const ivaBreakdown = p.ivaBreakdown || [];
  const payments = p.payments || [];
  const width = contentWidthMm(paperWidthMm);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${width}mm;
    margin: 0 auto;
    padding: 4mm 2mm;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .big { font-size: 14px; font-weight: 700; }
  .dashed { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-bottom: 3px; }
  .item-name { font-weight: 600; }
  .item-row { display: flex; justify-content: space-between; }
  .section-title { font-weight: 700; margin-bottom: 2px; }
  .qr { display: flex; justify-content: center; margin: 6px 0; }
  .totals .row { margin-bottom: 2px; }
  .footer { margin-top: 8px; }
  .logo { display: flex; justify-content: center; margin-bottom: 4px; }
  .logo img { max-width: 32mm; max-height: 20mm; object-fit: contain; }
</style>
</head>
<body>
  ${/* logoUrl (imagen normal del tenant), no logoEscposUrl -- ese otro campo
       es el bitmap ya convertido a comandos ESC/POS que usa el ESP32 (ver
       printbox/src/main.cpp#ensureTenantLogoCached), inutil como <img> acá.
       Mismo orden que el firmware: el logo va primero, antes del nombre. */
    business.logoUrl ? `
    <div class="logo">
      <img src="${esc(business.logoUrl)}" onerror="this.parentElement.style.display='none'" />
    </div>
  ` : ''}
  <div class="center big">${esc(business.name)}</div>
  ${business.cuit ? `<div class="center">CUIT: ${esc(business.cuit)}</div>` : ''}
  ${business.address ? `<div class="center">${esc(business.address)}</div>` : ''}
  ${business.phone ? `<div class="center">Tel: ${esc(business.phone)}</div>` : ''}
  ${business.ivaCondition ? `<div class="center">${esc(business.ivaCondition)}</div>` : ''}
  ${business.iibb ? `<div class="center">IIBB: ${esc(business.iibb)}</div>` : ''}
  ${business.activityStart ? `<div class="center">Inicio de actividades: ${esc(business.activityStart)}</div>` : ''}

  ${line()}
  <div class="center bold">${esc(p.receiptType)}</div>
  <div class="center">${esc(p.saleId)}</div>
  <div class="center">${esc(p.createdAt)}</div>
  ${p.sellerName ? `<div>Vendedor: ${esc(p.sellerName)}</div>` : ''}

  ${client.name && client.name !== 'Consumidor Final' ? `
    ${line()}
    <div class="section-title">CLIENTE</div>
    <div>${esc(client.name)}</div>
    ${client.dni ? `<div>${esc(client.docLabel || 'DNI')}: ${esc(client.dni)}</div>` : ''}
    ${client.phone ? `<div>Tel: ${esc(client.phone)}</div>` : ''}
  ` : ''}

  ${line()}
  ${renderItems(p.items)}

  ${line()}
  <div class="totals">
    ${p.discount ? `<div class="row"><span>Subtotal</span><span>$${money(p.subtotal)}</span></div>
    <div class="row"><span>Descuento</span><span>-$${money(p.discount)}</span></div>` : ''}
    ${ivaBreakdown.map((b) => `<div class="row"><span>IVA ${b.rate}%</span><span>$${money(b.amount)}</span></div>`).join('')}
    <div class="row big"><span>TOTAL</span><span>$${money(p.total)}</span></div>
  </div>

  ${line()}
  ${payments.map((pm) => `<div class="row"><span>${esc(pm.method)}</span><span>$${money(pm.amount)}</span></div>`).join('')}

  ${await renderInvoice(p.invoice)}
  ${renderShipping(p.shipping)}

  ${line()}
  <div class="center footer">${esc(p.footer)}</div>
</body>
</html>`;
}

module.exports = { buildTicketHtml, contentWidthMm };
