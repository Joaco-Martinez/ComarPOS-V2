/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/mobile/StatCard';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { usePlanFeaturesStore } from '@/store/planFeatures';
import { FileDown, FileText, RefreshCcw, AlertTriangle, Receipt, ShoppingCart, Landmark, Scale } from 'lucide-react';

type ArcaOwner = { id: string; businessName: string };
type Alicuota = { alicuota: number; base: number; iva: number };

type Comprobante = {
  invoiceAfipId: string;
  fecha: string;
  tipoComprobante: number;
  tipoComprobanteLabel: string;
  puntoVenta: number;
  numeroComprobante: number;
  codigoDocComprador: number;
  codigoDocCompradorLabel: string;
  nroDocComprador: string;
  denominacionComprador: string;
  importeTotal: number;
  importeNeto: number;
  importeIva: number;
  cae: string | null;
  esNotaCredito: boolean;
};

type Compra = {
  purchaseId: string;
  fecha: string;
  tipoComprobanteLabel: string;
  puntoVenta: number | null;
  numeroComprobante: string | null;
  cuitVendedor: string | null;
  denominacionVendedor: string | null;
  importeTotal: number;
  percepcionIva: number;
  otrasPercepcionesNacionales: number;
  percepcionIibb: number;
  percepcionMunicipal: number;
  impuestosInternos: number;
  importeIvaLiquidado: number;
  missingFields: string[];
};

type Report = {
  periodo: { year: number; month: number; label: string };
  negocio: { razonSocial: string | null; cuit: string | null; condicionIva: string | null };
  resumen: {
    ventasTotal: number | null;
    ventasFacturadas: number | null;
    ventasSinFacturar: number | null;
    cantidadVentas: number | null;
    facturado: number;
    notasCredito: number;
    netoFacturado: number;
    comprasTotal: number;
    comprasConDatosFaltantes: number;
  };
  comprobantes: Comprobante[];
  ivaVentas: Alicuota[];
  compras: Compra[];
  ivaCompras: Alicuota[];
  liquidacion: {
    debitoFiscal: number;
    creditoFiscal: number;
    saldoTecnicoAnterior: number;
    saldoTecnico: number;
    resultado: 'A_PAGAR' | 'A_FAVOR';
    status: 'BORRADOR' | 'CERRADO';
  } | null;
  liquidacionNota: string | null;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const cbteNumero = (pv: number | null, nro: number | string | null) =>
  pv == null || nro == null ? '—' : `${String(pv).padStart(5, '0')}-${String(nro).padStart(8, '0')}`;
// Con centavos: para el contador el redondeo a pesos de fmtMoney no sirve.
const moneyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n: number | null | undefined) => moneyFmt.format(Number.isFinite(Number(n)) ? Number(n) : 0);
const pct = (n: number) => `${String(n).replace('.', ',')}%`;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{note}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function AlicuotasTable({ rows, empty }: { rows: Alicuota[]; empty: string }) {
  if (rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>{empty}</div>;
  return (
    <div className="table-wrap">
      <table style={{ maxWidth: 520 }}>
        <thead><tr><th>Alícuota</th><th style={{ textAlign: 'right' }}>Base imponible</th><th style={{ textAlign: 'right' }}>IVA</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.alicuota}>
              <td>{pct(a.alicuota)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(a.base)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(a.iva)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ContadorPage() {
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: String(d.getFullYear()), month: String(d.getMonth() + 1) };
  });
  const multiInvoicingEnabled = usePlanFeaturesStore((s) => s.multiInvoicingEnabled);
  const [owners, setOwners] = useState<ArcaOwner[]>([]);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);

  useEffect(() => {
    if (!multiInvoicingEnabled) return;
    api.get('/arca-config/all').then(({ data }) => {
      setOwners((data?.content ?? data ?? []) as ArcaOwner[]);
    }).catch(() => setOwners([]));
  }, [multiInvoicingEnabled]);

  const params = () => ({ year: period.year, month: period.month, arcaConfigId: ownerFilter || undefined });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contador/reporte', { params: params() });
      setReport(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cargar el reporte');
      setReport(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [period.year, period.month, ownerFilter]);

  const download = async (kind: 'pdf' | 'docx') => {
    setDownloading(kind);
    try {
      const res = await api.get(`/contador/reporte.${kind}`, { params: params(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_contador_${period.year}_${period.month.padStart(2, '0')}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al generar el archivo');
    } finally { setDownloading(null); }
  };

  const r = report;
  const liq = r?.liquidacion ?? null;

  return (
    <AppLayout
      title="Contador"
      subtitle="Todo lo fiscal del mes en una sola página, para pasarle a tu contador"
      actions={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => download('pdf')} disabled={!!downloading || !r} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            {downloading === 'pdf' ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <FileDown size={13} />} PDF
          </button>
          <button onClick={() => download('docx')} disabled={!!downloading || !r} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            {downloading === 'docx' ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <FileText size={13} />} Word
          </button>
          <button onClick={load} className="btn btn-ghost btn-sm" title="Actualizar"><RefreshCcw size={13} /></button>
        </div>
      }
    >
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Año</label>
            <input type="number" value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: e.target.value }))} style={{ width: 100 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Mes</label>
            <select value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: e.target.value }))} style={{ width: 150 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          {multiInvoicingEnabled && owners.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Dueño</label>
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} style={{ width: 200 }}>
                <option value="">Todos combinados</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.businessName}</option>)}
              </select>
            </div>
          )}
          {r && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
              {[r.negocio.razonSocial, r.negocio.cuit && `CUIT ${r.negocio.cuit}`, r.negocio.condicionIva].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
      ) : !r ? (
        <div className="card" style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No se pudo cargar el reporte de este período.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            {r.resumen.ventasTotal != null && (
              <StatCard
                icon={ShoppingCart}
                label="Ventas del período"
                value={fmtMoney(r.resumen.ventasTotal)}
                sub={`${r.resumen.cantidadVentas} ventas · sin facturar ${fmtMoney(r.resumen.ventasSinFacturar)}`}
              />
            )}
            <StatCard
              icon={Receipt}
              label="Facturado neto"
              value={fmtMoney(r.resumen.netoFacturado)}
              sub={`Facturas ${fmtMoney(r.resumen.facturado)} · NC ${fmtMoney(r.resumen.notasCredito)}`}
            />
            <StatCard icon={ShoppingCart} color="var(--warn)" label="Compras" value={fmtMoney(r.resumen.comprasTotal)} sub={`${r.compras.length} comprobantes`} />
            <StatCard
              icon={Landmark}
              color="var(--success)"
              label="IVA débito / crédito"
              value={liq ? fmtMoney(liq.debitoFiscal) : '—'}
              sub={liq ? `Crédito ${fmtMoney(liq.creditoFiscal)} · saldo anterior ${fmtMoney(liq.saldoTecnicoAnterior)}` : undefined}
            />
            <StatCard
              icon={Scale}
              color={liq?.resultado === 'A_PAGAR' ? 'var(--danger)' : 'var(--success)'}
              label={liq ? (liq.resultado === 'A_PAGAR' ? 'IVA a pagar' : 'Saldo a favor') : 'Liquidación de IVA'}
              value={liq ? fmtMoney(Math.abs(liq.saldoTecnico)) : '—'}
              sub={liq ? (liq.status === 'CERRADO' ? 'Período cerrado' : 'Borrador') : r.liquidacionNota ?? undefined}
            />
          </div>

          {r.resumen.comprasConDatosFaltantes > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warn)',
              background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.25)',
              borderRadius: 6, padding: '7px 10px', marginBottom: 16,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              {r.resumen.comprasConDatosFaltantes} compra(s) sin CUIT, tipo o número de comprobante — completalas en Compras.
            </div>
          )}

          <Section title={`Comprobantes emitidos (${r.comprobantes.length})`} note="Facturas y notas de crédito aprobadas por ARCA, con CAE.">
            {r.comprobantes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>No hay comprobantes emitidos en el período.</div>
            ) : (
              <div className="table-wrap">
                <table style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Comprobante</th><th>Número</th><th>Receptor</th><th>Documento</th>
                      <th style={{ textAlign: 'right' }}>Neto</th><th style={{ textAlign: 'right' }}>IVA</th><th style={{ textAlign: 'right' }}>Total</th><th>CAE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.comprobantes.map((c) => (
                      <tr key={c.invoiceAfipId}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.fecha)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {c.tipoComprobanteLabel}
                          {c.esNotaCredito && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 9 }}>resta</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{cbteNumero(c.puntoVenta, c.numeroComprobante)}</td>
                        <td>{c.denominacionComprador}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{c.codigoDocComprador === 99 ? 'Cons. final' : `${c.codigoDocCompradorLabel} ${c.nroDocComprador}`}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(c.importeNeto)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(c.importeIva)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(c.importeTotal)}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{c.cae ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="IVA ventas por alícuota" note="Las notas de crédito restan.">
            <AlicuotasTable rows={r.ivaVentas} empty="Sin IVA discriminado en ventas (por ejemplo, solo Factura C)." />
          </Section>

          <Section title={`Compras (${r.compras.length})`}>
            {r.compras.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>No hay compras cargadas en el período.</div>
            ) : (
              <div className="table-wrap">
                <table style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Proveedor</th><th>CUIT</th><th>Comprobante</th><th>Número</th>
                      <th style={{ textAlign: 'right' }}>IVA</th><th style={{ textAlign: 'right' }}>Percep. IVA</th>
                      <th style={{ textAlign: 'right' }}>Otras percep.</th><th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.compras.map((c) => (
                      <tr key={c.purchaseId}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.fecha)}</td>
                        <td>
                          {c.denominacionVendedor ?? '—'}
                          {c.missingFields.length > 0 && (
                            <div style={{ fontSize: 10.5, color: 'var(--warn)' }}>Falta: {c.missingFields.join(', ')}</div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{c.cuitVendedor ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{c.tipoComprobanteLabel}</td>
                        <td style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {c.puntoVenta != null || c.numeroComprobante ? `${String(c.puntoVenta ?? '').padStart(5, '0')}-${c.numeroComprobante ?? ''}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(c.importeIvaLiquidado)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(c.percepcionIva)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {fmtMoney(c.otrasPercepcionesNacionales + c.percepcionIibb + c.percepcionMunicipal + c.impuestosInternos)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(c.importeTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="IVA compras por alícuota" note="Solo los comprobantes A y M dan crédito fiscal; B y C van a alícuota 0.">
            <AlicuotasTable rows={r.ivaCompras} empty="Sin compras con IVA en el período." />
          </Section>

          <Section title="Liquidación de IVA" note="Débito − crédito − saldo a favor del período anterior cerrado. Se cierra desde Libro IVA Digital.">
            {!liq ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{r.liquidacionNota ?? 'No se pudo calcular la liquidación.'}</div>
            ) : (
              <div className="table-wrap">
                <table style={{ maxWidth: 520 }}>
                  <tbody>
                    <tr><td>Débito fiscal</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(liq.debitoFiscal)}</td></tr>
                    <tr><td>Crédito fiscal</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>− {fmtMoney(liq.creditoFiscal)}</td></tr>
                    <tr><td>Saldo a favor del período anterior</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>− {fmtMoney(liq.saldoTecnicoAnterior)}</td></tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>{liq.resultado === 'A_PAGAR' ? 'Saldo técnico a pagar' : 'Saldo técnico a favor'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: liq.resultado === 'A_PAGAR' ? 'var(--danger)' : 'var(--success)' }}>
                        {fmtMoney(Math.abs(liq.saldoTecnico))}
                      </td>
                    </tr>
                    <tr><td>Estado</td><td style={{ textAlign: 'right' }}>{liq.status === 'CERRADO' ? 'Cerrado' : 'Borrador'}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </AppLayout>
  );
}
