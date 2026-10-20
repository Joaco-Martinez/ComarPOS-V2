'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import api from '@/lib/api';
import type { Product, VariantOption } from '@/types';
import { fmtKg } from '@/lib/helpers';
import { combinationsCount, MAX_VARIANT_COMBINATIONS, stockAt } from '@/lib/variants';
import VariantOptionsEditor from './VariantOptionsEditor';

interface Props {
  product: Product;
  onClose: () => void;
  onConverted: (parent: Product) => void;
}

type Mode = 'first_variant' | 'fresh';

// "Convertir a producto con variantes" (decision de negocio 2): el usuario
// elige si el producto actual pasa a ser la primera variante (conserva
// stock e historial) o si arranca de cero con un producto nuevo.
export default function ConvertToVariantsModal({ product, onClose, onConverted }: Props) {
  const [options, setOptions] = useState<VariantOption[]>([{ name: 'Talle', values: [] }]);
  const [mode, setMode] = useState<Mode>('first_variant');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [deactivateOriginal, setDeactivateOriginal] = useState(false);
  const [parentSku, setParentSku] = useState('');
  const [saving, setSaving] = useState(false);

  const validOptions = options.filter((o) => o.name.trim() && o.values.length > 0);
  const total = combinationsCount(validOptions);
  const stock = stockAt(product);
  const stockText = product.saleUnit === 'KG' ? `${fmtKg(stock)} kg` : `${stock} u.`;

  const missingAttribute = useMemo(
    () => mode === 'first_variant' && validOptions.some((o) => !o.values.includes(attributes[o.name] ?? '')),
    [mode, validOptions, attributes]
  );

  const canSave =
    !saving && validOptions.length > 0 && validOptions.length === options.length &&
    total > 0 && total <= MAX_VARIANT_COMBINATIONS && !missingAttribute;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/products/${product.id}/convert-to-variants`, {
        mode,
        variantOptions: validOptions,
        ...(mode === 'first_variant' ? { attributes } : { deactivateOriginal }),
        ...(parentSku.trim() ? { parentSku: parentSku.trim() } : {}),
      });
      toast.success('Producto convertido a producto con variantes');
      onConverted(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo convertir el producto');
    } finally {
      setSaving(false);
    }
  };

  const modeCard = (value: Mode, title: string, text: string) => (
    <label
      style={{
        display: 'flex', gap: 10, padding: 10, borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${mode === value ? 'var(--accent)' : 'var(--border2)'}`,
        background: mode === value ? 'var(--surface2)' : 'transparent',
      }}
    >
      <input type="radio" checked={mode === value} onChange={() => setMode(value)} style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{text}</div>
      </div>
    </label>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg modal-mobile-full" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Convertir a producto con variantes</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{product.name}</div>
          </div>
          <button onClick={onClose} disabled={saving} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>1. Opciones</div>
          <VariantOptionsEditor options={options} onChange={setOptions} />

          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>2. ¿Qué pasa con el producto actual?</div>
          {modeCard(
            'first_variant',
            'Convertirlo en la primera variante',
            `Se crea un producto principal con estos mismos datos y "${product.name}" pasa a ser una de sus variantes. Conserva su SKU, su stock (${stockText}), sus ventas, compras y movimientos. Las demás combinaciones se crean sin stock.`
          )}
          {mode === 'first_variant' && validOptions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, paddingLeft: 28 }}>
              {validOptions.map((o) => (
                <div key={o.name} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{o.name} del producto actual</label>
                  <select value={attributes[o.name] ?? ''} onChange={(e) => setAttributes((prev) => ({ ...prev, [o.name]: e.target.value }))}>
                    <option value="">Elegí…</option>
                    {o.values.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {modeCard(
            'fresh',
            'Empezar de cero',
            `Se crea un producto nuevo con variantes, todas sin stock. "${product.name}" queda como está, con su stock (${stockText}) y su historial, salvo que elijas desactivarlo.`
          )}
          {mode === 'fresh' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', paddingLeft: 28, cursor: 'pointer' }}>
              <input type="checkbox" checked={deactivateOriginal} onChange={(e) => setDeactivateOriginal(e.target.checked)} />
              Desactivar &quot;{product.name}&quot; (deja de aparecer para vender; no se borra su historial)
            </label>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">SKU base del producto principal (opcional)</label>
            <input
              value={parentSku}
              onChange={(e) => setParentSku(e.target.value)}
              placeholder="Ej: REM — las variantes nuevas quedan REM-M-ROJO, etc."
              style={{ fontFamily: 'var(--mono)' }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={saving} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={submit} disabled={!canSave} className="btn btn-primary btn-sm">
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Convertir (${total} variantes)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
