/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { fmtMoney } from '@/lib/helpers';
import { FileDown, AlertTriangle, RefreshCcw } from 'lucide-react';

type Resumen = {
  compras: { cantidad: number; total: number; conDatosFaltantes: number };
  ventas: { cantidad: number; total: number };
};

export default function LibroIvaDigitalPage() {
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: String(d.getFullYear()), month: String(d.getMonth() + 1) };
  });
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [period.year, period.month]);

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

  return (
    <AppLayout
      title="Libro IVA Digital"
      subtitle="Ventas y Compras del período, listos para AFIP/ARCA"
      actions={
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
      }
    >
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: 0, lineHeight: 1.6, maxWidth: 760 }}>
          El Libro IVA Digital (RG 4597) reemplazó al viejo régimen CITI (RG 3685, ya derogado) para registrar
          mensualmente tus comprobantes en el Portal IVA de AFIP/ARCA, antes de presentar la DDJJ de IVA.
          El lado de <strong>Ventas</strong> ya lo pre-carga AFIP solo, a partir de tus facturas con CAE — acá lo podés
          exportar igual para tener todo junto. El lado de <strong>Compras</strong> sí hay que armarlo con lo que vos
          cargaste, y es lo que en la práctica necesitás descargar y subir (o pasarle a tu contador).
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

      {loading ? (
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
      )}
    </AppLayout>
  );
}
