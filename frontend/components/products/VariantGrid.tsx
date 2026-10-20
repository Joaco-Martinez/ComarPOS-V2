/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { ImagePlus, RotateCcw, Package } from 'lucide-react';
import type { BusinessLocation, Product, VariantOption } from '@/types';
import ImageCropModal from '@/components/ImageCropModal';
import { fmtKg, fmtMoney, num } from '@/lib/helpers';
import { attributesOf, buildCombinations, labelOf, stockAt, valuesKey, variantValues } from '@/lib/variants';

export interface VariantRow {
  key: string;
  id?: string;
  values: string[];
  label: string;
  /** Combinaciones nuevas: si se crean o no. */
  include: boolean;
  /** Variante existente cuya combinación ya no está en las opciones. */
  toRemove: boolean;
  sku: string;
  /** '' = usa el precio/costo general del producto. */
  price: string;
  cost: string;
  customPrice: boolean;
  customCost: boolean;
  isActive: boolean;
  stock: Record<string, string>;
  minStock: Record<string, string>;
  imageUrl: string | null;
  imageFile: File | null;
  product?: Product;
}

const newRow = (values: string[]): VariantRow => ({
  key: valuesKey(values),
  values,
  label: labelOf(values),
  include: true,
  toRemove: false,
  sku: '',
  price: '',
  cost: '',
  customPrice: false,
  customCost: false,
  isActive: true,
  stock: {},
  minStock: {},
  imageUrl: null,
  imageFile: null,
});

/** Filas para las variantes que ya existen de un padre. */
export function rowsFromVariants(parent: Product): VariantRow[] {
  const options = parent.variantOptions ?? [];
  const isKg = parent.saleUnit === 'KG';
  return (parent.variants ?? []).map((v) => {
    const values = variantValues(v.variantAttributes, options);
    return {
      ...newRow(values),
      id: v.id,
      label: v.variantLabel ?? labelOf(values),
      sku: v.sku ?? '',
      price: v.customPrice ? String(isKg ? num(v.pricePerKg) : num(v.price)) : '',
      cost: v.customCost ? String(num(v.purchasePrice)) : '',
      customPrice: Boolean(v.customPrice),
      customCost: Boolean(v.customCost),
      isActive: v.isActive !== false,
      imageUrl: v.imageUrl ?? null,
      product: v,
    };
  });
}

/**
 * Re-arma las filas al cambiar las opciones: conserva lo cargado en cada
 * combinación (por clave posicional, así renombrar una opción no pierde
 * nada), agrega las nuevas y marca para quitar las existentes que sobran.
 */
export function reconcileRows(prev: VariantRow[], options: VariantOption[]): VariantRow[] {
  const valid = options.filter((o) => o.name.trim() && o.values.length > 0);
  const combos = valid.length === options.length && valid.length > 0 ? buildCombinations(valid) : [];
  const byKey = new Map(prev.map((r) => [r.key, r]));
  const used = new Set<string>();

  const rows = combos.map((values) => {
    const key = valuesKey(values);
    used.add(key);
    const existing = byKey.get(key);
    return existing ? { ...existing, values, label: labelOf(values), toRemove: false } : newRow(values);
  });

  const removed = prev.filter((r) => r.id && !used.has(r.key)).map((r) => ({ ...r, toRemove: true }));
  return [...rows, ...removed];
}

/** Lo que espera el backend (VariantInput) por cada fila. */
export function rowToVariantInput(row: VariantRow, options: VariantOption[], isKg: boolean, withStock: boolean) {
  const stockEntries = withStock
    ? Object.keys({ ...row.stock, ...row.minStock })
        .map((businessLocationId) => ({
          businessLocationId,
          qty: num(row.stock[businessLocationId] ?? ''),
          min: num(row.minStock[businessLocationId] ?? ''),
        }))
        .filter((e) => e.qty > 0 || e.min > 0)
        .map((e) => ({
          businessLocationId: e.businessLocationId,
          ...(isKg ? { quantityKg: e.qty } : { quantity: e.qty }),
          ...(e.min > 0 ? (isKg ? { minQuantityKg: e.min } : { minQuantity: e.min }) : {}),
        }))
    : [];

  const customPrice = row.customPrice && row.price.trim() !== '';
  const customCost = row.customCost && row.cost.trim() !== '';

  return {
    ...(row.id ? { id: row.id } : {}),
    attributes: attributesOf(row.values, options),
    ...(row.sku.trim() ? { sku: row.sku.trim() } : {}),
    isActive: row.isActive,
    customPrice,
    ...(customPrice ? (isKg ? { pricePerKg: num(row.price) } : { price: num(row.price) }) : {}),
    customCost,
    ...(customCost ? { purchasePrice: num(row.cost) } : {}),
    ...(stockEntries.length ? { initialStock: stockEntries } : {}),
  };
}

interface Props {
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
  isKg: boolean;
  generalPrice: string;
  generalCost: string;
  generalSku: string;
  generalImageUrl?: string | null;
  /** Sucursales para cargar stock inicial de las variantes nuevas. */
  locations: BusinessLocation[];
  showStockInputs: boolean;
}

const fieldLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text3)', marginBottom: 3, display: 'block' };

export default function VariantGrid({
  rows, onChange, isKg, generalPrice, generalCost, generalSku, generalImageUrl, locations, showStockInputs,
}: Props) {
  const [cropFor, setCropFor] = useState<{ key: string; file: File } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const patch = (key: string, p: Partial<VariantRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const setAll = (p: Partial<VariantRow>) => onChange(rows.map((r) => (r.toRemove ? r : { ...r, ...p })));

  const newCount = rows.filter((r) => !r.id && !r.toRemove).length;
  const removeCount = rows.filter((r) => r.toRemove).length;

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
        Cargá al menos una opción con sus valores para armar las variantes.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)' }}>
        <span>
          {rows.filter((r) => !r.toRemove && (r.id || r.include)).length} variantes
          {newCount > 0 && rows.some((r) => r.id) ? ` · ${newCount} nuevas` : ''}
        </span>
        {newCount > 0 && (
          <>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAll({ include: true })}>Tildar todas</button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange(rows.map((r) => (r.id ? r : { ...r, include: false })))}>Destildar nuevas</button>
          </>
        )}
      </div>

      {removeCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--warn)', padding: '6px 10px', background: 'rgba(243,156,18,0.08)', borderRadius: 6 }}>
          {removeCount} variante{removeCount === 1 ? '' : 's'} ya no corresponde{removeCount === 1 ? '' : 'n'} a las opciones: al guardar, las que tienen ventas, compras, movimientos o stock se desactivan; las que no tienen historial se borran.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
        {rows.map((row) => {
          const disabled = row.toRemove || (!row.id && !row.include);
          const thumb = previews[row.key] ?? row.imageUrl ?? generalImageUrl ?? null;
          const currentStock = row.product ? stockAt(row.product) : null;

          return (
            <div
              key={row.key + (row.id ?? '')}
              style={{
                border: '1px solid var(--border2)', borderRadius: 8, padding: 8,
                background: row.toRemove ? 'transparent' : 'var(--surface)',
                opacity: disabled ? 0.55 : 1,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!row.id && (
                  <input type="checkbox" checked={row.include} onChange={(e) => patch(row.key, { include: e.target.checked })} title="Crear esta variante" />
                )}
                <label
                  style={{ position: 'relative', width: 32, height: 32, flexShrink: 0, cursor: row.toRemove ? 'default' : 'pointer' }}
                  title={row.imageUrl || previews[row.key] ? 'Cambiar foto de la variante' : 'Subir foto de la variante (si no, usa la del producto)'}
                >
                  {thumb ? (
                    <img src={thumb} alt={row.label} style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', opacity: row.imageUrl || previews[row.key] ? 1 : 0.5 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={13} style={{ color: 'var(--text3)' }} />
                    </div>
                  )}
                  {!row.toRemove && (
                    <>
                      <ImagePlus size={11} style={{ position: 'absolute', right: -3, bottom: -3, color: 'var(--text2)', background: 'var(--surface)', borderRadius: 3 }} />
                      <input
                        type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setCropFor({ key: row.key, file });
                          e.target.value = '';
                        }}
                      />
                    </>
                  )}
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textDecoration: row.toRemove ? 'line-through' : 'none' }}>{row.label}</div>
                  {currentStock !== null && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      Stock actual: {isKg ? `${fmtKg(currentStock)}kg` : currentStock}
                    </div>
                  )}
                </div>
                {!row.toRemove && (row.id || row.include) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={row.isActive} onChange={(e) => patch(row.key, { isActive: e.target.checked })} />
                    Activa
                  </label>
                )}
              </div>

              {!disabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                  <div>
                    <span style={fieldLabel}>SKU</span>
                    <input
                      value={row.sku}
                      onChange={(e) => patch(row.key, { sku: e.target.value })}
                      placeholder={generalSku.trim() ? `${generalSku.trim()}-…` : 'Automático'}
                      style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <span style={fieldLabel}>
                      {isKg ? 'Precio/kg' : 'Precio'}{' '}
                      {row.customPrice && row.price.trim() !== '' && <span className="badge badge-amber" style={{ fontSize: 9, padding: '0 4px' }}>personalizado</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number" min="0" step="any"
                        value={row.price}
                        onChange={(e) => patch(row.key, { price: e.target.value, customPrice: e.target.value.trim() !== '' && num(e.target.value) !== num(generalPrice) })}
                        placeholder={generalPrice ? fmtMoney(num(generalPrice)) : 'General'}
                        style={{ fontSize: 12, minWidth: 0 }}
                      />
                      {row.customPrice && row.price.trim() !== '' && (
                        <button type="button" className="btn btn-ghost btn-xs" title="Volver al precio general" onClick={() => patch(row.key, { price: '', customPrice: false })}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={fieldLabel}>
                      Costo{' '}
                      {row.customCost && row.cost.trim() !== '' && <span className="badge badge-amber" style={{ fontSize: 9, padding: '0 4px' }}>propio</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number" min="0" step="any"
                        value={row.cost}
                        onChange={(e) => patch(row.key, { cost: e.target.value, customCost: e.target.value.trim() !== '' && num(e.target.value) !== num(generalCost) })}
                        placeholder={generalCost ? fmtMoney(num(generalCost)) : 'General'}
                        style={{ fontSize: 12, minWidth: 0 }}
                      />
                      {row.customCost && row.cost.trim() !== '' && (
                        <button type="button" className="btn btn-ghost btn-xs" title="Volver al costo general" onClick={() => patch(row.key, { cost: '', customCost: false })}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!disabled && showStockInputs && !row.id && locations.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  {locations.map((loc) => (
                    <div key={loc.id}>
                      <span style={fieldLabel}>Stock inicial · {loc.name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          type="number" min="0" step="any"
                          value={row.stock[loc.id] ?? ''}
                          onChange={(e) => patch(row.key, { stock: { ...row.stock, [loc.id]: e.target.value } })}
                          placeholder="Cant."
                          style={{ fontSize: 12, minWidth: 0 }}
                        />
                        <input
                          type="number" min="0" step="any"
                          value={row.minStock[loc.id] ?? ''}
                          onChange={(e) => patch(row.key, { minStock: { ...row.minStock, [loc.id]: e.target.value } })}
                          placeholder="Mín."
                          title="Stock mínimo (dispara la alerta de stock bajo)"
                          style={{ fontSize: 12, minWidth: 0 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ImageCropModal
        open={cropFor !== null}
        file={cropFor?.file ?? null}
        onClose={() => setCropFor(null)}
        onCropped={(file) => {
          if (!cropFor) return;
          setPreviews((prev) => ({ ...prev, [cropFor.key]: URL.createObjectURL(file) }));
          patch(cropFor.key, { imageFile: file });
          setCropFor(null);
        }}
      />
    </div>
  );
}
