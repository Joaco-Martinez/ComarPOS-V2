/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation } from '@/types';
import { fmtDate, fmtKg, normalizeArray } from '@/lib/helpers';
import { ArrowDown, ArrowUp, History, Save, Warehouse } from 'lucide-react';

type FallbackLogItem = {
  id: string;
  createdAt: string;
  quantity: number | null;
  quantityKg: number | null;
  saleId: string | null;
  saleStatus: string | null;
  saleLocation: { id: string; name: string } | null;
  product: { id: string; name: string; sku: string | null };
  fromLocation: { id: string; name: string } | null;
  user: { id: string; name: string } | null;
};

// Configuracion > Stock: stock de respaldo. Si la sucursal de la venta se
// queda sin un producto, el faltante se descuenta de estas ubicaciones (en
// este orden) en vez de bloquear la venta. Cada uso queda en el registro de
// abajo y le llega una notificacion a los administradores.
export default function StockSettingsPage() {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<FallbackLogItem[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [lr, sr] = await Promise.all([
        api.get('/business-locations'),
        api.get('/tenant/stock-settings'),
      ]);
      setLocations(normalizeArray<BusinessLocation>(lr.data).filter((l) => l.isActive));
      setEnabled(!!sr.data.settings?.stockFallbackEnabled);
      setSelectedIds(sr.data.settings?.stockFallbackLocationIds ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const loadLog = async () => {
    setLogLoading(true);
    try {
      const { data } = await api.get('/tenant/stock-fallback-log', { params: { limit: 100 } });
      setLog(data.items ?? []);
    } catch {
      setLog([]);
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => { load(); loadLog(); }, []);

  // Seleccionadas primero (en su orden de prioridad), despues el resto.
  const ordered = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l]));
    const selected = selectedIds.map((id) => byId.get(id)).filter((l): l is BusinessLocation => !!l);
    const rest = locations.filter((l) => !selectedIds.includes(l.id));
    return [...selected, ...rest];
  }, [locations, selectedIds]);

  const toggleLocation = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const move = (id: string, delta: number) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = async () => {
    if (enabled && selectedIds.length === 0) {
      toast.error('Elegí al menos una ubicación de respaldo');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch('/tenant/stock-settings', {
        stockFallbackEnabled: enabled,
        stockFallbackLocationIds: selectedIds,
      });
      setEnabled(!!data.settings?.stockFallbackEnabled);
      setSelectedIds(data.settings?.stockFallbackLocationIds ?? []);
      toast.success('Configuración guardada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const fmtQty = (item: FallbackLogItem) =>
    item.quantityKg != null && item.quantityKg > 0 ? `${fmtKg(item.quantityKg)} kg` : String(item.quantity ?? 0);

  return (
    <AppLayout
      title="Configuración de stock"
      subtitle="Qué pasa cuando una sucursal se queda sin stock"
      actions={
        <button onClick={save} disabled={saving || loading} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Save size={13} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2 }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Usar stock de respaldo</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                  Si la sucursal desde la que vendés se queda sin un producto, se sigue pudiendo vender y lo que falta
                  se descuenta de las ubicaciones de respaldo que elijas abajo, en ese orden. Cada vez que pase queda
                  registrado acá y les llega un aviso a los administradores.
                </div>
              </div>
            </label>
          </div>

          <div className="card" style={{ padding: '18px 20px', opacity: enabled ? 1 : 0.55 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Ubicaciones de respaldo</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              Tildá las ubicaciones de donde se puede tomar stock y ordenalas por prioridad (la primera se usa primero).
              Si vendés desde una ubicación que también es de respaldo, para esa venta se saltea.
            </div>
            {ordered.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>No hay ubicaciones activas. Creá una en Sucursales.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ordered.map((l) => {
                  const position = selectedIds.indexOf(l.id);
                  const selected = position >= 0;
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!enabled}
                        onChange={() => toggleLocation(l.id)}
                        style={{ width: 16, height: 16 }}
                      />
                      <Warehouse size={16} color="var(--text3)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{l.name}</div>
                        {selected && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Prioridad {position + 1}</div>}
                      </div>
                      {selected && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={!enabled || position === 0}
                            onClick={() => move(l.id, -1)}
                            aria-label="Subir prioridad"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={!enabled || position === selectedIds.length - 1}
                            onClick={() => move(l.id, 1)}
                            aria-label="Bajar prioridad"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <History size={16} color="var(--text3)" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Registro de ventas con stock de respaldo</div>
            </div>
            {logLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
            ) : log.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>Todavía no se usó stock de respaldo.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Sin stock en</th>
                      <th>Se descontó de</th>
                      <th>Vendedor</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((item) => (
                      <tr key={item.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(item.createdAt)}</td>
                        <td>{item.product?.name}</td>
                        <td>{fmtQty(item)}</td>
                        <td>{item.saleLocation?.name ?? '—'}</td>
                        <td>{item.fromLocation?.name ?? '—'}</td>
                        <td>{item.user?.name ?? '—'}</td>
                        <td>
                          {item.saleStatus === 'CANCELLED'
                            ? <span className="badge badge-red">Cancelada</span>
                            : <span className="badge badge-green">Vigente</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
