'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ELEMENT_GAP_MM,
  LABEL_PADDING_MM,
  LINE_HEIGHT,
  formatLabelPrice,
  type LabelDesign,
  type LabelElementKey,
  type LabelTextStyle,
} from '@/lib/labelDesign';

// Vista previa de una etiqueta, dibujada con los mismos valores que usa el
// PDF (backend/src/services/barcode.service.ts#drawLabel): elementos
// apilados en el orden del diseno, medidas en mm y letras en pt.

export type PreviewProduct = {
  name: string;
  sku: string;
  price: number;
  extraPrices: { listId: string; label: string; price: number }[];
};

const MM_PX = 96 / 25.4;
const PT_PX = 96 / 72;

const barcodeCache = new Map<string, string>();

function useBarcodeDataUrl(sku: string) {
  const [url, setUrl] = useState<string | null>(() => barcodeCache.get(sku) ?? null);
  useEffect(() => {
    let cancelled = false;
    const cached = barcodeCache.get(sku);
    if (cached) { setUrl(cached); return; }
    import('bwip-js/browser')
      .then(({ default: bwipjs }) => {
        const canvas = document.createElement('canvas');
        bwipjs.toCanvas(canvas, { bcid: 'code128', text: sku || '0', scale: 3, height: 12, includetext: false, backgroundcolor: 'FFFFFF' });
        const data = canvas.toDataURL('image/png');
        barcodeCache.set(sku, data);
        if (!cancelled) setUrl(data);
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [sku]);
  return url;
}

export default function LabelPreview({
  design,
  product,
  zoom = 1.5,
  selectedElement,
  onSelectElement,
  onOverflowChange,
}: {
  design: LabelDesign;
  product: PreviewProduct;
  zoom?: number;
  selectedElement?: LabelElementKey | null;
  onSelectElement?: (key: LabelElementKey) => void;
  onOverflowChange?: (overflow: boolean) => void;
}) {
  const barcodeUrl = useBarcodeDataUrl(product.sku);
  const mm = (n: number) => n * MM_PX * zoom;
  const pt = (n: number) => n * PT_PX * zoom;
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // Aviso si el contenido no entra en la etiqueta (en el PDF se recorta).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // (el ultimo elemento deja su separacion abajo: no cuenta)
    const over = el.scrollHeight - ELEMENT_GAP_MM * MM_PX * zoom > el.clientHeight + 1;
    setOverflow(over);
    onOverflowChange?.(over);
  });

  const textStyle = (s: Pick<LabelTextStyle, 'size' | 'bold' | 'color' | 'align'>, maxLines = 1): React.CSSProperties => ({
    fontSize: pt(s.size),
    fontWeight: s.bold ? 700 : 400,
    color: s.color,
    textAlign: s.align,
    lineHeight: LINE_HEIGHT,
    overflow: 'hidden',
    ...(maxLines === 1
      ? { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
      : { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }),
  });

  const wrap = (key: LabelElementKey, children: React.ReactNode) => {
    const active = selectedElement === key;
    return (
      <div
        key={key}
        onClick={onSelectElement ? (e) => { e.stopPropagation(); onSelectElement(key); } : undefined}
        style={{
          marginBottom: mm(ELEMENT_GAP_MM),
          cursor: onSelectElement ? 'pointer' : undefined,
          outline: active ? '1.5px dashed #2563eb' : undefined,
          outlineOffset: 1,
          borderRadius: 2,
          flexShrink: 0,
        }}
        title={onSelectElement ? 'Click para editar' : undefined}
      >
        {children}
      </div>
    );
  };

  const elements = design.order.map((key) => {
    if (key === 'name' && design.name.show) {
      return wrap(key, <div style={textStyle(design.name, design.name.maxLines)}>{product.name}</div>);
    }
    if (key === 'barcode' && design.barcode.show) {
      return wrap(key, (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {barcodeUrl ? (
            <img
              src={barcodeUrl}
              alt=""
              style={{ width: `${design.barcode.widthPct}%`, height: mm(design.barcode.heightMm), imageRendering: 'pixelated', display: 'block' }}
            />
          ) : (
            <div style={{ width: `${design.barcode.widthPct}%`, height: mm(design.barcode.heightMm), background: '#eee' }} />
          )}
        </div>
      ));
    }
    if (key === 'sku' && design.sku.show) {
      return wrap(key, <div style={textStyle(design.sku)}>{product.sku}</div>);
    }
    if (key === 'price' && design.price.show) {
      const price = formatLabelPrice(product.price, design.price.decimals);
      return wrap(key, <div style={textStyle(design.price)}>{design.price.showLabel ? `Precio: ${price}` : price}</div>);
    }
    if (key === 'extras' && design.extras.show && product.extraPrices.length > 0) {
      return wrap(key, (
        <div>
          {product.extraPrices.map((extra) => (
            <div key={extra.listId} style={textStyle({ ...design.extras, ...(design.listStyles[extra.listId] ?? {}) })}>
              {extra.label}: {formatLabelPrice(extra.price, design.price.decimals)}
            </div>
          ))}
        </div>
      ));
    }
    return null;
  });

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          width: mm(design.widthMm),
          height: mm(design.heightMm),
          background: '#ffffff',
          border: design.border ? '1px solid #cccccc' : '1px dashed #e5e7eb',
          boxShadow: overflow ? '0 0 0 2px #ef4444' : '0 1px 4px rgba(0,0,0,0.12)',
          borderRadius: 2,
          overflow: 'hidden',
          fontFamily: 'Helvetica, Arial, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div
          ref={innerRef}
          style={{ padding: mm(LABEL_PADDING_MM), height: '100%', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {elements}
        </div>
      </div>
      {overflow && (
        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>No entra todo: achicá algo o agrandá la etiqueta</span>
      )}
    </div>
  );
}
