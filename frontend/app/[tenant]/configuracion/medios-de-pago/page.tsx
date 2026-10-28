/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { PaymentMethod } from '@/types';
import { num } from '@/lib/helpers';
import { ADJUSTABLE_PAYMENT_METHODS, type PaymentAdjustment } from '@/lib/paymentAdjustments';
import { Save } from 'lucide-react';

type RowType = 'NONE' | 'DISCOUNT' | 'SURCHARGE';
type Row = { type: RowType; percent: string };

// Configuracion > Medios de pago: descuento o recargo automatico segun como
// paga el cliente (ej. 10% off en efectivo, 15% de recargo con tarjeta). El
// POS lo aplica solo al elegir el metodo; el vendedor lo puede quitar o
// cambiar para una venta puntual.
export default function PaymentSettingsPage() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyAdjustments = (adjustments: PaymentAdjustment[]) => {
    const next: Record<string, Row> = {};
    ADJUSTABLE_PAYMENT_METHODS.forEach(({ method }) => {
      const adj = adjustments.find((a) => a.method === method);
      next[method] = adj ? { type: adj.type, percent: String(adj.percent) } : { type: 'NONE', percent: '' };
    });
    setRows(next);
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/tenant/payment-settings');
        applyAdjustments(data.settings?.adjustments ?? []);
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'No se pudo cargar la configuración');
        applyAdjustments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateRow = (method: PaymentMethod, patch: Partial<Row>) => {
    setRows((prev) => ({ ...prev, [method]: { ...prev[method], ...patch } }));
  };

  const save = async () => {
    const adjustments: PaymentAdjustment[] = [];
    for (const { method, label } of ADJUSTABLE_PAYMENT_METHODS) {
      const row = rows[method];
      if (!row || row.type === 'NONE') continue;
      const percent = num(row.percent);
      if (!(percent > 0)) {
        toast.error(`Poné un porcentaje mayor a 0 para ${label}`);
        return;
      }
      if (row.type === 'DISCOUNT' && percent >= 100) {
        toast.error(`El descuento de ${label} tiene que ser menor a 100%`);
        return;
      }
      adjustments.push({ method, type: row.type, percent });
    }
    setSaving(true);
    try {
      const { data } = await api.patch('/tenant/payment-settings', { adjustments });
      applyAdjustments(data.settings?.adjustments ?? []);
      toast.success('Configuración guardada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      title="Medios de pago"
      subtitle="Descuentos o recargos automáticos según cómo paga el cliente"
      actions={
        <button onClick={save} disabled={saving || loading} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Save size={13} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 14 }}>
              Cuando en el POS se elige un medio de pago con ajuste, el descuento o recargo se aplica solo sobre el
              total de la venta. Ejemplo: <b>Efectivo → Descuento 10%</b>. El vendedor lo ve en el resumen y lo puede
              quitar o cambiar para una venta puntual. Con &quot;Varios métodos&quot; no se aplica automáticamente.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ADJUSTABLE_PAYMENT_METHODS.map(({ method, label }) => {
                const row = rows[method] ?? { type: 'NONE', percent: '' };
                const active = row.type !== 'NONE';
                return (
                  <div
                    key={method}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, flexWrap: 'wrap',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ flex: '1 1 140px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                    <select
                      value={row.type}
                      onChange={(e) => updateRow(method, { type: e.target.value as RowType })}
                      style={{ width: 150 }}
                    >
                      <option value="NONE">Sin ajuste</option>
                      <option value="DISCOUNT">Descuento</option>
                      <option value="SURCHARGE">Recargo</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number" min="0" step="any"
                        value={row.percent}
                        disabled={!active}
                        onChange={(e) => updateRow(method, { percent: e.target.value })}
                        placeholder="0"
                        style={{ width: 80 }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text3)' }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
