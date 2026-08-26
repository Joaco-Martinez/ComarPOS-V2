/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { fmtMoney } from '@/lib/helpers';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import { FileDown, AlertTriangle, RefreshCcw, Lock, Unlock, Calculator } from 'lucide-react';

type Resumen = {
  compras: { cantidad: number; total: number; conDatosFaltantes: number };
  ventas: { cantidad: number; total: number };
};

type Liquidacion = {
  id: string | null;
  year: number;
  month: number;
  debitoFiscal: number;
  creditoFiscal: number;
  saldoTecnicoAnterior: number;
  saldoTecnico: number;
  resultado: 'A_PAGAR' | 'A_FAVOR';
  saldoAFavorProximoPeriodo: number;
  status: 'BORRADOR' | 'CERRADO';
  closedAt: string | null;
  closedByUserId: string | null;
  editable: boolean;
};

export default function LibroIvaDigitalPage() {
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: String(d.getFullYear()), month: String(d.getMonth() + 1) };
  });
  const [tab, setTab] = useState<'libro' | 'liquidacion'>('libro');

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const [liquidacion, setLiquidacion] = useState<Liquidacion | null>(null);
  const [loadingLiquidacion, setLoadingLiquidacion] = useState(true);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/libro-iva-digital/resumen', { params: period });
      setResumen(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cargar el resumen');
      setResumen(null);
    } finally { setLoading(false); }
  };

  const loadLiquidacion = async () => {
    setLoadingLiquidacion(true);
    try {
      const { data } = await api.get('/libro-iva-digital/liquidacion', { params: period });
      setLiquidacion(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al calcular la liquidación');
      setLiquidacion(null);
    } finally { setLoadingLiquidacion(false); }
  };

  useEffect(() => { load(); loadLiquidacion(); }, [period.year, period.month]);

  const download = async (kind: 'ventas-cbte' | 'ventas-alicuotas' | 'compras-cbte' | 'compras-alicuotas') => {
    setDownloading(kind);
    try {
      const res = await api.get(`/libro-iva-digital/${kind}.csv`, { params: period, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `libro_iva_${kind.replace('-', '_')}_${period.year}_${period.month.padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al generar el archivo');
    } finally { setDownloading(null); }
  };

  const monthLabel = new Date(2000, Number(period.month) - 1, 1).toLocaleDateString('es-AR', { month: 'long' });

  const cerrarPeriodo = async () => {
    setClosing(true);
    try {
      const { data } = await api.post('/libro-iva-digital/liquidacion/cerrar', {
        year: Number(period.year),
        month: Number(period.month),
      });
      setLiquidacion(data);
      toast.success(`Período ${monthLabel} ${period.year} cerrado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cerrar el período');
    } finally { setClosing(false); }
  };

  const askCerrar = () => setConfirmState({
    title: 'Cerrar período',
    message: `Vas a cerrar la liquidación de IVA de ${monthLabel} ${period.year}. Una vez cerrado, el resultado queda congelado (no se recalcula solo aunque cargues ventas o compras de ese mes con fecha retroactiva) y hace falta reabrirlo a mano para volver a calcularlo. ¿Confirmás?`,
    onConfirm: cerrarPeriodo,
  });

  const reabrirPeriodo = async () => {
    setReopening(true);
    try {
      const { data } = await api.post('/libro-iva-digital/liquidacion/reabrir', {
        year: Number(period.year),
        month: Number(period.month),
      });
      setLiquidacion(data);
      toast.success('Período reabierto');
      loadLiquidacion();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al reabrir el período');
    } finally { setReopening(false); }
  };

  const askReabrir = () => setConfirmState({
    title: 'Reabrir período',
    message: `El período ${monthLabel} ${period.year} ya está cerrado. Reabrirlo lo vuelve a dejar en borrador para recalcularlo — si ya cerraste períodos posteriores que arrastraron este saldo, vas a tener que revisarlos y volver a cerrarlos también. ¿Confirmás?`,
    onConfirm: reabrirPeriodo,
  });

  return (
    <AppLayout
      title="Libro IVA Digital"
      subtitle="Ventas, Compras y Liquidación de IVA del período"
      actions={
        <button onClick={() => { load(); loadLiquidacion(); }} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
      }
    >
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: 0, lineHeight: 1.6, maxWidth: 760 }}>
          El Libro IVA Digital (RG 4597) reemplazó al viejo régimen CITI (RG 3685, ya derogado) para registrar
          mensualmente tus comprobantes en el Portal IVA de AFIP/ARCA, antes de presentar la DDJJ de IVA.
          El lado de <strong>Ventas</strong> ya lo pre-carga AFIP solo, a partir de tus facturas con CAE — acá lo podés
          exportar igual para tener todo junto. El lado de <strong>Compras</strong> sí hay que armarlo con lo que vos
          cargaste, y es lo que en la práctica necesitás descargar y subir (o pasarle a tu contador). La pestaña
          <strong> Liquidación</strong> calcula cuánto IVA hay que pagar (o cuánto saldo a favor queda) en el mes.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 14 }}>
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
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'libro', label: 'Libro IVA' },
          { key: 'liquidacion', label: 'Liquidación' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn btn-ghost btn-sm"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--text)' : 'var(--text3)',
              fontWeight: tab === t.key ? 700 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'libro' && (
        loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Ventas</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Ya facturadas con CAE — AFIP las pre-carga sola</div>
                </div>
                <span className="badge badge-blue">{resumen?.ventas.cantidad ?? 0} comprobantes</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', marginBottom: 14 }}>
                {fmtMoney(resumen?.ventas.total ?? 0)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => download('ventas-cbte')} disabled={downloading === 'ventas-cbte'} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                  <FileDown size={13} /> Comprobantes (CSV)
                </button>
                <button onClick={() => download('ventas-alicuotas')} disabled={downloading === 'ventas-alicuotas'} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                  <FileDown size={13} /> Alícuotas de IVA (CSV)
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Compras</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Con lo cargado en Compras</div>
                </div>
                <span className="badge badge-blue">{resumen?.compras.cantidad ?? 0} comprobantes</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', marginBottom: 10 }}>
                {fmtMoney(resumen?.compras.total ?? 0)}
              </div>
              {!!resumen?.compras.conDatosFaltantes && (
                <a href="../compras" style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warn)',
                  background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.25)',
                  borderRadius: 6, padding: '7px 10px', marginBottom: 14,
                }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                  {resumen.compras.conDatosFaltantes} compra(s) sin CUIT, tipo o número de comprobante — completalas en Compras antes de exportar
                </a>
              )}
              {!resumen?.compras.conDatosFaltantes && <div style={{ marginBottom: 14 }} />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => download('compras-cbte')} disabled={downloading === 'compras-cbte'} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                  <FileDown size={13} /> Comprobantes (CSV)
                </button>
                <button onClick={() => download('compras-alicuotas')} disabled={downloading === 'compras-alicuotas'} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                  <FileDown size={13} /> Alícuotas de IVA (CSV)
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {tab === 'liquidacion' && (
        loadingLiquidacion ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}><div className="spinner" /></div>
        ) : !liquidacion ? (
          <div className="card" style={{ padding: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No se pudo calcular la liquidación de este período.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 18, maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Liquidación de IVA — {monthLabel} {period.year}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {liquidacion.status === 'CERRADO'
                    ? `Cerrado${liquidacion.closedAt ? ` el ${new Date(liquidacion.closedAt).toLocaleDateString('es-AR')}` : ''} — congelado`
                    : 'Borrador — se recalcula con cada carga de ventas/compras'}
                </div>
              </div>
              <span className={liquidacion.status === 'CERRADO' ? 'badge badge-green' : 'badge badge-amber'}>
                {liquidacion.status === 'CERRADO' ? <Lock size={11} style={{ marginRight: 4 }} /> : <Calculator size={11} style={{ marginRight: 4 }} />}
                {liquidacion.status === 'CERRADO' ? 'Cerrado' : 'Borrador'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Débito fiscal (IVA Ventas)</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{fmtMoney(liquidacion.debitoFiscal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Crédito fiscal (IVA Compras)</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{fmtMoney(liquidacion.creditoFiscal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Saldo a favor período anterior</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{fmtMoney(liquidacion.saldoTecnicoAnterior)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                  {liquidacion.resultado === 'A_PAGAR' ? 'Saldo técnico (a pagar)' : 'Saldo técnico (a favor)'}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)',
                  color: liquidacion.resultado === 'A_PAGAR' ? 'var(--danger)' : 'var(--success)',
                }}>
                  {fmtMoney(Math.abs(liquidacion.saldoTecnico))}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '12px 14px', borderRadius: 8, marginBottom: 16,
              background: liquidacion.resultado === 'A_PAGAR' ? 'rgba(239,68,68,0.08)' : 'rgba(24,193,94,0.08)',
              border: `1px solid ${liquidacion.resultado === 'A_PAGAR' ? 'rgba(239,68,68,0.25)' : 'rgba(24,193,94,0.25)'}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: liquidacion.resultado === 'A_PAGAR' ? 'var(--danger)' : 'var(--success)' }}>
                {liquidacion.resultado === 'A_PAGAR' ? 'A pagar' : 'A favor'}
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: liquidacion.resultado === 'A_PAGAR' ? 'var(--danger)' : 'var(--success)' }}>
                {fmtMoney(Math.abs(liquidacion.saldoTecnico))}
              </span>
            </div>

            {liquidacion.resultado === 'A_FAVOR' && liquidacion.saldoAFavorProximoPeriodo > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Este saldo a favor se arrastra automáticamente al período siguiente cuando cierres {monthLabel} {period.year}.
              </p>
            )}

            {liquidacion.status === 'CERRADO' ? (
              <button onClick={askReabrir} disabled={reopening} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                <Unlock size={13} /> Reabrir período
              </button>
            ) : (
              <button onClick={askCerrar} disabled={closing} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                <Lock size={13} /> Cerrar período
              </button>
            )}
          </div>
        )
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
