import { describe, expect, it } from 'vitest';
import { isResolvableAppPath } from '../routeGuard';

describe('isResolvableAppPath', () => {
  it('resolves the homepage', () => {
    expect(isResolvableAppPath('/')).toBe(true);
  });

  it('flags a bare garbage path as unresolvable (the audited soft-404 case)', () => {
    expect(isResolvableAppPath('/some-path-that-does-not-exist')).toBe(false);
  });

  it('resolves known single-level static pages', () => {
    for (const p of ['/login', '/app', '/instalar', '/prueba-gratis', '/suscripcion', '/terminos', '/privacidad', '/arrepentimiento', '/about', '/contact', '/privacy']) {
      expect(isResolvableAppPath(p)).toBe(true);
    }
  });

  it('rejects sub-paths of single-level static pages', () => {
    expect(isResolvableAppPath('/login/foo')).toBe(false);
    expect(isResolvableAppPath('/instalar/foo')).toBe(false);
  });

  it('resolves single-dynamic-segment pages with exactly one extra segment', () => {
    expect(isResolvableAppPath('/para/kioscos-y-almacenes')).toBe(true);
    expect(isResolvableAppPath('/presupuesto/abc123')).toBe(true);
  });

  it('rejects single-dynamic-segment pages with zero or extra segments', () => {
    expect(isResolvableAppPath('/para')).toBe(false);
    expect(isResolvableAppPath('/para/rubro/extra')).toBe(false);
    expect(isResolvableAppPath('/presupuesto')).toBe(false);
  });

  it('rejects a bare potential tenant slug (no [tenant]/page.tsx exists)', () => {
    expect(isResolvableAppPath('/mitienda')).toBe(false);
  });

  it('resolves a tenant slug followed by a known sub-route', () => {
    expect(isResolvableAppPath('/mitienda/dashboard')).toBe(true);
    expect(isResolvableAppPath('/mitienda/pos')).toBe(true);
    expect(isResolvableAppPath('/mitienda/configuracion')).toBe(true);
  });

  it('rejects a tenant slug followed by an unknown sub-route', () => {
    expect(isResolvableAppPath('/mitienda/no-existe')).toBe(false);
  });

  it('allows deeper paths under a known tenant sub-route (not re-validated here)', () => {
    expect(isResolvableAppPath('/mitienda/configuracion/empresa')).toBe(true);
  });
});
