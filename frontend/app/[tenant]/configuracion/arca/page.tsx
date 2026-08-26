/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { toDateInputAR, formatDateAR, formatDateTimeAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import {
  ShieldCheck, Building2, FileKey2, FileText, CheckCircle2, XCircle,
  AlertCircle, HelpCircle, RefreshCcw, Save, Plus, Edit2, Trash2,
  Download, Upload, BadgeCheck, Loader2, Video,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type ArcaEnvironment = 'HOMOLOGACION' | 'PRODUCCION';
type ArcaConfigStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'INCOMPLETE' | 'CERT_EXPIRED';
type RemitoMode = 'DIGITAL_FULL' | 'PREPRINTED_FORM';

interface ArcaConfig {
  id: string;
  businessName: string;
  cuit: string;
  ivaCondition?: string | null;
  fiscalAddress?: string | null;
  iibb?: string | null;
  activityStart?: string | null;
  environment: ArcaEnvironment;
  status: ArcaConfigStatus;
  defaultPointOfSale?: number | null;
  defaultCurrencyId: string;
  defaultConcept: number;
  certAlias?: string | null;
  certExpiresAt?: string | null;
  csrGeneratedAt?: string | null;
  lastError?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ArcaPointOfSale {
  id: string;
  number: number;
  description?: string | null;
  enabled: boolean;
  isDefault: boolean;
  enabledCbteTypes: number[];
}

interface RemitoCaiConfig {
  id: string;
  mode: RemitoMode;
  pointOfSale: number;
  cai: string;
  expiresAt: string;
  rangeFrom?: number | null;
  rangeTo?: number | null;
  nextNumber?: number | null;
  enabled: boolean;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContent<T>(data: any): T {
  if (data && typeof data === 'object') {
    if ('content' in data) return data.content as T;
    if ('data' in data) return data.data as T;
  }
  return data as T;
}

function fmtDate(v?: string | null) {
  return formatDateAR(v);
}

function fmtDateTime(v?: string | null) {
  return formatDateTimeAR(v);
}

function toDateInput(v?: string | null) {
  return toDateInputAR(v);
}

// slice(0, 11) va DESPUES de sacar los guiones/espacios -- si el limite de
// largo se aplicara antes (ej. maxLength en el input) un CUIT pegado con
// guiones tipo "30-71938650-0" (13 caracteres) se cortaba a los 11
// caracteres crudos y perdia digitos reales antes de poder limpiarlos.
function normalizeCuit(v: string) { return v.replace(/\D/g, '').slice(0, 11); }

const NOW_TS = new Date().getTime();

// Codigos AFIP de comprobante (ver backend/src/afip/ivaCondition.ts para
// los de Factura -- 1/6/11 -- mas las Notas de Credito equivalentes que
// hacen falta para devoluciones: 3/8/13). Antes se cargaban a mano como
// texto separado por coma ("1,6,11,3,8,13"); ahora es un checklist.
const CBTE_TYPE_OPTIONS: { code: number; label: string }[] = [
  { code: 1, label: 'Factura A' },
  { code: 6, label: 'Factura B' },
  { code: 11, label: 'Factura C' },
  { code: 3, label: 'Nota de Crédito A' },
  { code: 8, label: 'Nota de Crédito B' },
  { code: 13, label: 'Nota de Crédito C' },
];

function cbteTypesLabel(codes?: number[] | null) {
  if (!codes || !codes.length) return '—';
  return codes
    .map((c) => CBTE_TYPE_OPTIONS.find((o) => o.code === c)?.label ?? `Cód. ${c}`)
    .join(', ');
}

// ─── Static data ─────────────────────────────────────────────────────────────

const IVA_OPTIONS = [
  { label: 'IVA Responsable Inscripto', value: 'IVA RESPONSABLE INSCRIPTO' },
  { label: 'Responsable Monotributo',   value: 'RESPONSABLE MONOTRIBUTO' },
  { label: 'Consumidor Final',          value: 'CONSUMIDOR FINAL' },
  { label: 'IVA Sujeto Exento',         value: 'IVA SUJETO EXENTO' },
  { label: 'IVA No Responsable',        value: 'IVA NO RESPONSABLE' },
];

const CURRENCY_OPTIONS = [
  { label: 'Pesos argentinos (PES)', value: 'PES' },
  { label: 'Dólar estadounidense (DOL)', value: 'DOL' },
];

const CONCEPT_OPTIONS = [
  { label: 'Productos',              value: '1' },
  { label: 'Servicios',             value: '2' },
  { label: 'Productos y servicios', value: '3' },
];

const ENV_OPTIONS: { label: string; value: ArcaEnvironment }[] = [
  { label: 'Homologación / pruebas', value: 'HOMOLOGACION' },
  { label: 'Producción / real',      value: 'PRODUCCION' },
];

const REMITO_MODE_OPTIONS: { label: string; value: RemitoMode }[] = [
  { label: 'Digital completo',          value: 'DIGITAL_FULL' },
  { label: 'Formulario preimpreso',     value: 'PREPRINTED_FORM' },
];

// ─── Empty forms ──────────────────────────────────────────────────────────────

const emptyFiscal = {
  businessName: '', fantasyName: '', cuit: '', ivaCondition: 'IVA RESPONSABLE INSCRIPTO',
  fiscalAddress: '', iibb: '', activityStart: '',
  environment: 'HOMOLOGACION' as ArcaEnvironment,
  defaultPointOfSale: '1', defaultCurrencyId: 'PES', defaultConcept: '1',
};

type TenantEmpresaInfo = { name: string; ticketBusinessName: string | null; ticketCuit: string | null; ticketAddress: string | null };

const emptyPoint = {
  id: '', number: '', description: '', enabled: true, isDefault: true,
  enabledCbteTypes: [1, 6, 11, 3, 8, 13] as number[],
};

const emptyRemitoCai = {
  id: '', mode: 'DIGITAL_FULL' as RemitoMode, pointOfSale: '1',
  cai: '', expiresAt: '', rangeFrom: '1', rangeTo: '99999999', nextNumber: '1', enabled: true,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, right, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode;
  right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {icon && (
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {icon}
            </div>
          )}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function HelpField({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        {help && (
          <span title={help} style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text3)', display: 'inline-grid', placeItems: 'center', cursor: 'help', flexShrink: 0 }}>
            <HelpCircle size={10} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusChip({ tone, children }: { tone: 'green' | 'red' | 'yellow' | 'blue' | 'gray'; children: React.ReactNode }) {
  const styles = {
    green:  { bg: 'rgba(24,193,94,0.12)',  border: 'rgba(24,193,94,0.28)',  color: 'var(--success)' },
    red:    { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.28)',  color: 'var(--danger)' },
    yellow: { bg: 'rgba(243,156,18,0.12)', border: 'rgba(243,156,18,0.28)', color: 'var(--warn)' },
    blue:   { bg: 'rgba(13,89,231,0.12)',  border: 'rgba(13,89,231,0.28)',  color: 'var(--accent)' },
    gray:   { bg: 'var(--surface2)',        border: 'var(--border)',         color: 'var(--text3)' },
  }[tone];
  return (
    <span style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArcaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [savingFiscal, setSavingFiscal] = useState(false);

  const [config, setConfig]       = useState<ArcaConfig | null>(null);
  const [points, setPoints]       = useState<ArcaPointOfSale[]>([]);
  const [remitoCais, setRemitoCais] = useState<RemitoCaiConfig[]>([]);
  const [tenantInfo, setTenantInfo] = useState<TenantEmpresaInfo | null>(null);

  const [fiscalForm, setFiscalForm]       = useState(emptyFiscal);
  const [pointForm, setPointForm]         = useState(emptyPoint);
  const [remitoCaiForm, setRemitoCaiForm] = useState(emptyRemitoCai);

  const [certFile, setCertFile]       = useState<File | null>(null);
  const [keyFile, setKeyFile]         = useState<File | null>(null);
  const [certExpiresAt, setCertExpiresAt] = useState('');

  const activeRemitoCai = useMemo(
    () => remitoCais.find(r => r.enabled && new Date(r.expiresAt).getTime() >= NOW_TS),
    [remitoCais]
  );

  const statusInfo = useMemo(() => {
    if (!config) return { text: 'Sin configurar', tone: 'gray' as const };
    if (config.status === 'ACTIVE')       return config.environment === 'PRODUCCION' ? { text: 'Producción activa', tone: 'green' as const } : { text: 'Homologación activa', tone: 'blue' as const };
    if (config.status === 'ERROR')        return { text: 'Error', tone: 'red' as const };
    if (config.status === 'CERT_EXPIRED') return { text: 'Certificado vencido', tone: 'red' as const };
    return { text: 'Incompleta', tone: 'yellow' as const };
  }, [config]);

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'ok') {
    if (type === 'err') toast.error(msg);
    else if (type === 'info') toast(msg);
    else toast.success(msg);
  }

  function getErr(err: any, fallback: string) {
    return err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? fallback;
  }

  function fillFiscal(c: ArcaConfig, fantasyName?: string) {
    setFiscalForm((prev) => ({
      businessName: c.businessName ?? '',
      fantasyName: fantasyName ?? prev.fantasyName,
      cuit: c.cuit ?? '',
      ivaCondition: c.ivaCondition ?? 'IVA RESPONSABLE INSCRIPTO',
      fiscalAddress: c.fiscalAddress ?? '',
      iibb: c.iibb ?? '',
      activityStart: toDateInput(c.activityStart),
      environment: c.environment ?? 'HOMOLOGACION',
      defaultPointOfSale: String(c.defaultPointOfSale ?? 1),
      defaultCurrencyId: c.defaultCurrencyId ?? 'PES',
      defaultConcept: String(c.defaultConcept ?? 1),
    }));
  }

  // Trae los datos ya cargados en Configuracion > Empresa para no tener que
  // retipearlos aca -- no guarda nada solo, el usuario todavia tiene que
  // apretar "Guardar datos fiscales".
  function autocompleteFromEmpresa() {
    if (!tenantInfo) { showToast('Todavía no se cargaron los datos de Empresa', 'err'); return; }
    setFiscalForm((prev) => ({
      ...prev,
      businessName: tenantInfo.name || prev.businessName,
      fantasyName: tenantInfo.ticketBusinessName || prev.fantasyName,
      cuit: tenantInfo.ticketCuit ? normalizeCuit(tenantInfo.ticketCuit) : prev.cuit,
      fiscalAddress: tenantInfo.ticketAddress || prev.fiscalAddress,
    }));
    showToast('Autocompletado con los datos de Empresa', 'info');
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [cfgRes, pvRes, caiRes, tenantRes] = await Promise.all([
        api.get('/arca-config/config').catch(() => null),
        api.get('/arca-config/puntos-venta').catch(() => null),
        api.get('/arca-config/remitos-cai').catch(() => null),
        api.get('/tenant/me').catch(() => null),
      ]);
      const cfg  = cfgRes  ? getContent<ArcaConfig | null>(cfgRes.data)           : null;
      const pvs  = pvRes   ? getContent<ArcaPointOfSale[]>(pvRes.data)             : [];
      const cais = caiRes  ? getContent<RemitoCaiConfig[]>(caiRes.data)            : [];
      const tenant = tenantRes?.data?.tenant as TenantEmpresaInfo | undefined;
      setConfig(cfg);
      setPoints(Array.isArray(pvs) ? pvs : []);
      setRemitoCais(Array.isArray(cais) ? cais : []);
      if (tenant) setTenantInfo(tenant);
      if (cfg) fillFiscal(cfg, tenant?.ticketBusinessName ?? undefined);
    } catch (err: any) {
      showToast(getErr(err, 'Error al cargar la configuración ARCA'), 'err');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fiscal ──

  async function handleSaveFiscal() {
    if (savingFiscal) return;
    const cuit = normalizeCuit(fiscalForm.cuit);
    if (!fiscalForm.businessName.trim()) { showToast('La razón social es obligatoria', 'err'); return; }
    if (cuit.length !== 11) { showToast('El CUIT debe tener 11 dígitos sin guiones', 'err'); return; }
    setSavingFiscal(true);
    try {
      const { data } = await api.put('/arca-config/config', {
        businessName: fiscalForm.businessName.trim(),
        cuit, ivaCondition: fiscalForm.ivaCondition,
        fiscalAddress: fiscalForm.fiscalAddress || null,
        iibb: fiscalForm.iibb || null,
        activityStart: fiscalForm.activityStart || null,
        environment: fiscalForm.environment,
        defaultPointOfSale: fiscalForm.defaultPointOfSale,
        defaultCurrencyId: fiscalForm.defaultCurrencyId,
        defaultConcept: fiscalForm.defaultConcept,
      });
      const saved = getContent<ArcaConfig>(data);
      setConfig(saved);
      fillFiscal(saved);

      // El nombre de fantasia es dato de Tenant (mismo campo que Configuracion
      // > Empresa, ver ticket.service.ts), no de ArcaConfig -- se guarda aparte.
      // Best-effort: requiere rol ADMIN (PATCH /tenant/me), asi que un
      // CONTADOR puede guardar los datos fiscales igual aunque esto falle.
      if (fiscalForm.fantasyName.trim() !== (tenantInfo?.ticketBusinessName ?? '')) {
        try {
          const { data: tenantRes } = await api.patch('/tenant/me', { ticketBusinessName: fiscalForm.fantasyName.trim() || null });
          if (tenantRes?.tenant) setTenantInfo(tenantRes.tenant);
        } catch { /* ver comentario arriba */ }
      }

      const pvRes = await api.get('/arca-config/puntos-venta').catch(() => null);
      if (pvRes) setPoints(getContent<ArcaPointOfSale[]>(pvRes.data) ?? []);
      showToast('Configuración fiscal guardada', 'ok');
    } catch (err: any) {
      showToast(getErr(err, 'Error al guardar los datos fiscales'), 'err');
    } finally { setSavingFiscal(false); }
  }

  // ── Certificate ──

  async function handleGenerateCsr() {
    setSaving(true);
    try {
      const { data } = await api.post('/arca-config/generate-csr', {
        businessName: fiscalForm.businessName.trim(),
        cuit: normalizeCuit(fiscalForm.cuit),
        ivaCondition: fiscalForm.ivaCondition,
        fiscalAddress: fiscalForm.fiscalAddress || null,
        iibb: fiscalForm.iibb || null,
        activityStart: fiscalForm.activityStart || null,
        environment: fiscalForm.environment,
        defaultPointOfSale: fiscalForm.defaultPointOfSale,
        defaultCurrencyId: fiscalForm.defaultCurrencyId,
        defaultConcept: fiscalForm.defaultConcept,
        certAlias: 'COMARPOS',
      });
      setConfig(getContent<ArcaConfig>(data));
      showToast('CSR generado. Descargalo y subilo en ARCA.', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al generar CSR'), 'err'); }
    finally { setSaving(false); }
  }

  async function handleDownloadCsr() {
    try {
      const url = config?.id ? `/arca-config/${config.id}/download-csr` : '/arca-config/download-csr';
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pkcs10' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pedido-arca-${config?.id ?? Date.now()}.csr`;
      link.click();
      showToast('CSR descargado', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al descargar CSR'), 'err'); }
  }

  async function handleUploadCertificate() {
    if (!certFile) { showToast('Seleccioná el certificado .crt', 'err'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('cert', certFile);
      if (keyFile) fd.append('key', keyFile);
      if (certExpiresAt) fd.append('certExpiresAt', certExpiresAt);
      const { data } = await api.post('/arca-config/certificados', fd);
      setConfig(getContent<ArcaConfig>(data));
      setCertFile(null); setKeyFile(null); setCertExpiresAt('');
      showToast('Certificado cargado correctamente', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al cargar certificado'), 'err'); }
    finally { setSaving(false); }
  }

  function askDeleteCertificates() {
    setConfirmState({
      title: 'Eliminar certificados',
      message: '¿Seguro querés eliminar los certificados?',
      onConfirm: handleDeleteCertificates,
    });
  }

  async function handleDeleteCertificates() {
    setSaving(true);
    try {
      const { data } = await api.delete('/arca-config/certificados');
      setConfig(getContent<ArcaConfig>(data));
      showToast('Certificados eliminados', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al eliminar certificados'), 'err'); }
    finally { setSaving(false); }
  }

  async function handleActivate() {
    setSaving(true);
    try {
      const url = config?.id ? `/arca-config/${config.id}/activate` : '/arca-config/activate';
      const { data } = await api.patch(url);
      setConfig(getContent<ArcaConfig>(data));
      showToast('Configuración ARCA activada', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al activar ARCA'), 'err'); }
    finally { setSaving(false); }
  }

  async function handleTestWsaa() {
    setSaving(true);
    try {
      await api.post('/arca-config/test/wsaa');
      await loadAll();
      showToast('WSAA OK — token generado correctamente', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error probando WSAA'), 'err'); }
    finally { setSaving(false); }
  }

  async function handleTestWsfe() {
    setSaving(true);
    try {
      await api.post('/arca-config/test/wsfe-dummy');
      await loadAll();
      showToast('Test WSFE correcto', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error probando WSFE'), 'err'); }
    finally { setSaving(false); }
  }

  // ── Points of sale ──

  async function handleSavePoint() {
    if (!pointForm.number || Number(pointForm.number) <= 0) { showToast('El número de PV debe ser > 0', 'err'); return; }
    setSaving(true);
    try {
      await api.post('/arca-config/puntos-venta', {
        id: pointForm.id || undefined,
        number: pointForm.number,
        description: pointForm.description || null,
        enabled: pointForm.enabled,
        isDefault: pointForm.isDefault,
        enabledCbteTypes: pointForm.enabledCbteTypes,
      });
      setPointForm(emptyPoint);
      const { data } = await api.get('/arca-config/puntos-venta');
      setPoints(getContent<ArcaPointOfSale[]>(data) ?? []);
      const cfgRes = await api.get('/arca-config/config').catch(() => null);
      if (cfgRes) setConfig(getContent<ArcaConfig>(cfgRes.data));
      showToast('Punto de venta guardado', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al guardar PV'), 'err'); }
    finally { setSaving(false); }
  }

  function askDeletePoint(id: string) {
    setConfirmState({
      title: 'Eliminar punto de venta',
      message: '¿Eliminar este punto de venta?',
      onConfirm: () => handleDeletePoint(id),
    });
  }

  async function handleDeletePoint(id: string) {
    setSaving(true);
    try {
      await api.delete(`/arca-config/puntos-venta/${id}`);
      const { data } = await api.get('/arca-config/puntos-venta');
      setPoints(getContent<ArcaPointOfSale[]>(data) ?? []);
      showToast('Punto de venta eliminado', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al eliminar PV'), 'err'); }
    finally { setSaving(false); }
  }

  // ── Remito CAI ──

  async function handleSaveRemitoCai() {
    if (!remitoCaiForm.cai.trim()) { showToast('El CAI es obligatorio', 'err'); return; }
    if (!remitoCaiForm.expiresAt)  { showToast('El vencimiento del CAI es obligatorio', 'err'); return; }
    setSaving(true);
    try {
      const payload = {
        mode: remitoCaiForm.mode,
        pointOfSale: remitoCaiForm.pointOfSale,
        cai: remitoCaiForm.cai,
        expiresAt: remitoCaiForm.expiresAt,
        rangeFrom: remitoCaiForm.rangeFrom || null,
        rangeTo: remitoCaiForm.rangeTo || null,
        nextNumber: remitoCaiForm.nextNumber || null,
        enabled: remitoCaiForm.enabled,
      };
      if (remitoCaiForm.id) {
        await api.put(`/arca-config/remitos-cai/${remitoCaiForm.id}`, payload);
      } else {
        await api.post('/arca-config/remitos-cai', payload);
      }
      setRemitoCaiForm(emptyRemitoCai);
      const { data } = await api.get('/arca-config/remitos-cai');
      setRemitoCais(getContent<RemitoCaiConfig[]>(data) ?? []);
      showToast('CAI de remito guardado', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al guardar CAI'), 'err'); }
    finally { setSaving(false); }
  }

  function askDeleteRemitoCai(id: string) {
    setConfirmState({
      title: 'Eliminar CAI de remitos',
      message: '¿Eliminar este CAI de remitos?',
      onConfirm: () => handleDeleteRemitoCai(id),
    });
  }

  async function handleDeleteRemitoCai(id: string) {
    setSaving(true);
    try {
      await api.delete(`/arca-config/remitos-cai/${id}`);
      const { data } = await api.get('/arca-config/remitos-cai');
      setRemitoCais(getContent<RemitoCaiConfig[]>(data) ?? []);
      showToast('CAI eliminado', 'ok');
    } catch (err: any) { showToast(getErr(err, 'Error al eliminar CAI'), 'err'); }
    finally { setSaving(false); }
  }

  function fp(k: keyof typeof fiscalForm, v: any) { setFiscalForm(p => ({ ...p, [k]: v })); }
  function pp(k: keyof typeof pointForm, v: any)   { setPointForm(p => ({ ...p, [k]: v })); }
  function rp(k: keyof typeof remitoCaiForm, v: any) { setRemitoCaiForm(p => ({ ...p, [k]: v })); }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout
      title="Configuración ARCA / AFIP"
      subtitle="Datos fiscales, certificados, puntos de venta y CAI de remitos"
      actions={
        <button onClick={loadAll} disabled={loading} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          {loading ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <RefreshCcw size={13} />}
          Actualizar
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10, color: 'var(--text3)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Cargando ARCA…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>

          {/* ── Video tutorial ── */}
          <SectionCard
            title="Video: cómo configurar ARCA / AFIP"
            subtitle="Guía paso a paso para completar esta pantalla"
            icon={<Video size={18} color="var(--accent)" />}
          >
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <iframe
                src="https://www.youtube.com/embed/TCHLPytU47Q"
                title="Cómo configurar ARCA / AFIP"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
          </SectionCard>

          {/* ── Estado general ── */}
          <SectionCard
            title="Estado general"
            subtitle="Resumen de la configuración fiscal y remitos"
            icon={<ShieldCheck size={18} color="var(--accent)" />}
            right={<StatusChip tone={statusInfo.tone}>{statusInfo.text}</StatusChip>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 10 }}>
              {[
                { label: 'Razón social',   value: config?.businessName ?? 'Sin configurar' },
                { label: 'CUIT',           value: config?.cuit ?? '—' },
                { label: 'Certificado',    value: config?.certExpiresAt ? `Vence ${fmtDate(config.certExpiresAt)}` : 'Sin certificado' },
                { label: 'CAI remitos',    value: activeRemitoCai ? `PV ${String(activeRemitoCai.pointOfSale).padStart(4,'0')} · Próx. ${activeRemitoCai.nextNumber ?? '—'}` : 'Sin CAI activo' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
            {config?.lastError && (
              <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: 12, display: 'flex', gap: 8, color: 'var(--danger)', fontSize: 13 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                {config.lastError}
              </div>
            )}
          </SectionCard>

          {/* ── Datos fiscales ── */}
          <SectionCard
            title="Datos fiscales"
            subtitle="Aparecen en facturas, tickets fiscales y remitos"
            icon={<Building2 size={18} color="var(--accent2)" />}
            right={
              <button onClick={autocompleteFromEmpresa} className="btn btn-secondary btn-sm" style={{ gap: 6 }} type="button">
                <Building2 size={13} /> Autocompletar con Empresa
              </button>
            }
          >
            {fiscalForm.environment === 'PRODUCCION' && (
              <div style={{ background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Estás en <strong>ambiente de producción</strong>. Las facturas emitidas tienen validez fiscal real ante AFIP.</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
              <HelpField label="Razón social *" help="Nombre legal o razón social que se imprime en los comprobantes.">
                <input value={fiscalForm.businessName} onChange={e => fp('businessName', e.target.value)} placeholder="Mi Negocio S.R.L." />
              </HelpField>
              <HelpField label="Nombre de fantasía" help="Nombre comercial del negocio. Es el mismo dato que Configuración > Empresa.">
                <input value={fiscalForm.fantasyName} onChange={e => fp('fantasyName', e.target.value)} placeholder="Mi Negocio" />
              </HelpField>
              <HelpField label="CUIT *" help="Podés pegarlo con guiones (ej: 30-71938650-0), se limpia solo.">
                <input value={fiscalForm.cuit} onChange={e => fp('cuit', normalizeCuit(e.target.value))} placeholder="30719386500" />
              </HelpField>
              <HelpField label="Condición IVA" help="Condición fiscal exacta para evitar errores en comprobantes.">
                <select value={fiscalForm.ivaCondition} onChange={e => fp('ivaCondition', e.target.value)}>
                  {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </HelpField>
              <HelpField label="Ingresos Brutos" help="Número de inscripción en IIBB. Sale impreso en remitos.">
                <input value={fiscalForm.iibb} onChange={e => fp('iibb', e.target.value)} placeholder="Número IIBB" />
              </HelpField>
              <HelpField label="Inicio de actividades" help="Fecha de inicio de actividades. Sale en remitos.">
                <input type="date" value={fiscalForm.activityStart} onChange={e => fp('activityStart', e.target.value)} />
              </HelpField>
              <HelpField label="Ambiente" help="Homologación = pruebas. Producción = comprobantes reales con validez fiscal.">
                <select value={fiscalForm.environment} onChange={e => fp('environment', e.target.value as ArcaEnvironment)}>
                  {ENV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </HelpField>
              <HelpField label="Punto de venta principal" help="Número de punto de venta usado por defecto para comprobantes. Ej: 1">
                <input type="number" min="1" value={fiscalForm.defaultPointOfSale} onChange={e => fp('defaultPointOfSale', e.target.value)} placeholder="1" />
              </HelpField>
              <HelpField label="Moneda" help="Moneda fiscal predeterminada. En Argentina se usa PES.">
                <select value={fiscalForm.defaultCurrencyId} onChange={e => fp('defaultCurrencyId', e.target.value)}>
                  {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </HelpField>
              <HelpField label="Concepto AFIP" help="1=Productos, 2=Servicios, 3=Ambos. Para un POS de mercadería usá Productos.">
                <select value={fiscalForm.defaultConcept} onChange={e => fp('defaultConcept', e.target.value)}>
                  {CONCEPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </HelpField>
              <div style={{ gridColumn: '1 / -1' }}>
                <HelpField label="Domicilio fiscal" help="Domicilio registrado en AFIP. Puede aparecer en remitos.">
                  <input value={fiscalForm.fiscalAddress} onChange={e => fp('fiscalAddress', e.target.value)} placeholder="Calle, número, localidad, provincia" />
                </HelpField>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSaveFiscal} disabled={savingFiscal || !fiscalForm.businessName} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {savingFiscal ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Save size={13} />}
                Guardar datos fiscales
              </button>
            </div>
          </SectionCard>

          {/* ── Certificado ARCA ── */}
          <SectionCard
            title="Certificado ARCA"
            subtitle="Generá CSR, subí el .crt y activá la configuración"
            icon={<FileKey2 size={18} color="var(--warn)" />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'CSR generado',     value: fmtDateTime(config?.csrGeneratedAt) },
                { label: 'Alias cert.',      value: config?.certAlias ?? '—' },
                { label: 'Vencimiento',      value: fmtDate(config?.certExpiresAt) },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              <button onClick={handleGenerateCsr} disabled={saving} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <FileText size={13} />} Generar CSR
              </button>
              <button onClick={handleDownloadCsr} disabled={!config?.csrGeneratedAt} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                <Download size={13} /> Descargar CSR
              </button>
              <button onClick={handleActivate} disabled={saving} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                <BadgeCheck size={13} /> Activar ARCA
              </button>
              <button onClick={handleTestWsaa} disabled={saving} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                <CheckCircle2 size={13} /> Test WSAA
              </button>
              <button onClick={handleTestWsfe} disabled={saving} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                <CheckCircle2 size={13} /> Test WSFE
              </button>
              <button onClick={askDeleteCertificates} disabled={saving} className="btn btn-danger btn-sm" style={{ gap: 6 }}>
                <XCircle size={13} /> Borrar certificados
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
              <HelpField label="Certificado .crt" help="Archivo que descarga ARCA después de subir el CSR.">
                <input type="file" accept=".crt,.pem,.cer" onChange={e => setCertFile(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px' }} />
                {certFile && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3 }}>✓ {certFile.name}</div>}
              </HelpField>
              <HelpField label="Clave privada .key (opcional)" help="Solo si no generaste el CSR desde el sistema.">
                <input type="file" accept=".key,.pem" onChange={e => setKeyFile(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px' }} />
                {keyFile && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3 }}>✓ {keyFile.name}</div>}
              </HelpField>
              <HelpField label="Vencimiento certificado (opcional)" help="Si lo dejás vacío, el backend lo lee del certificado.">
                <input type="date" value={certExpiresAt} onChange={e => setCertExpiresAt(e.target.value)} />
              </HelpField>
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={handleUploadCertificate} disabled={saving || !certFile} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Upload size={13} />} Subir certificado
              </button>
            </div>
          </SectionCard>

          {/* ── Puntos de venta ── */}
          <SectionCard
            title="Puntos de venta fiscales"
            subtitle="Configurá los números habilitados en ARCA para emitir facturas y notas de crédito"
            icon={<FileText size={18} color="var(--accent3)" />}
          >
            <div style={{ background: 'rgba(13,89,231,0.07)', border: '1px solid rgba(13,89,231,0.18)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
              <strong>¿Qué es un punto de venta?</strong> Es el número que ARCA asigna para emitir comprobantes. El punto <strong>0001</strong> se carga como <strong>1</strong>. Elegí abajo qué tipos de comprobante puede emitir.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14, marginBottom: 14 }}>
              <HelpField label="Número de PV" help="El número dado de alta en ARCA. Si aparece como 0001, cargá 1.">
                <input type="number" min="1" value={pointForm.number} onChange={e => pp('number', e.target.value)} placeholder="1" />
              </HelpField>
              <HelpField label="Descripción" help="Referencia interna. Ej: Local principal, Caja 1.">
                <input value={pointForm.description} onChange={e => pp('description', e.target.value)} placeholder="Local principal" />
              </HelpField>
              <div style={{ display: 'grid', gap: 10, alignContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pointForm.enabled} onChange={e => pp('enabled', e.target.checked)} style={{ width: 14, height: 14 }} />
                  Usar este PV
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pointForm.isDefault} onChange={e => pp('isDefault', e.target.checked)} style={{ width: 14, height: 14 }} />
                  Marcar como principal
                </label>
              </div>
            </div>
            <HelpField label="Tipos de comprobante habilitados" help="Qué puede emitir este punto de venta.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 8, marginBottom: 14 }}>
                {CBTE_TYPE_OPTIONS.map(({ code, label }) => {
                  const checked = pointForm.enabledCbteTypes.includes(code);
                  return (
                    <label
                      key={code}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border2)'}`,
                        background: checked ? 'var(--accent-dim)' : 'transparent',
                        borderRadius: 8, padding: '8px 10px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => pp(
                          'enabledCbteTypes',
                          e.target.checked
                            ? [...pointForm.enabledCbteTypes, code]
                            : pointForm.enabledCbteTypes.filter((c) => c !== code)
                        )}
                        style={{ width: 14, height: 14 }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </HelpField>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <button onClick={handleSavePoint} disabled={saving} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : pointForm.id ? <Save size={13} /> : <Plus size={13} />}
                {pointForm.id ? 'Actualizar PV' : 'Agregar PV'}
              </button>
              {pointForm.id && (
                <button onClick={() => setPointForm(emptyPoint)} className="btn btn-secondary btn-sm">Cancelar</button>
              )}
            </div>
            <ResponsiveTable
              data={points}
              keyFor={(pv) => pv.id}
              emptyMessage="Sin puntos de venta"
              columns={[
                { key: 'pv', header: 'PV', render: (pv) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{String(pv.number).padStart(4, '0')}</span> },
                { key: 'descripcion', header: 'Descripción', render: (pv) => <>{pv.description ?? '—'}</> },
                { key: 'tipos', header: 'Tipos', render: (pv) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{cbteTypesLabel(pv.enabledCbteTypes)}</span> },
                {
                  key: 'estado', header: 'Estado', render: (pv) => (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <StatusChip tone={pv.enabled ? 'green' : 'gray'}>{pv.enabled ? 'Activo' : 'Inactivo'}</StatusChip>
                      {pv.isDefault && <StatusChip tone="blue">Principal</StatusChip>}
                    </div>
                  ),
                },
                {
                  key: 'acciones', header: '', render: (pv) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setPointForm({ id: pv.id, number: String(pv.number), description: pv.description ?? '', enabled: pv.enabled, isDefault: pv.isDefault, enabledCbteTypes: pv.enabledCbteTypes ?? [] })} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                      <button onClick={() => askDeletePoint(pv.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                    </div>
                  ),
                },
              ] as ResponsiveTableColumn<ArcaPointOfSale>[]}
              renderMobileCard={(pv) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="mobile-card-head">
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{String(pv.number).padStart(4, '0')}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <StatusChip tone={pv.enabled ? 'green' : 'gray'}>{pv.enabled ? 'Activo' : 'Inactivo'}</StatusChip>
                      {pv.isDefault && <StatusChip tone="blue">Principal</StatusChip>}
                    </div>
                  </div>
                  <div className="mobile-card-row">
                    <span>Descripción</span>
                    <span>{pv.description ?? '—'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span>Tipos</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{cbteTypesLabel(pv.enabledCbteTypes)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={(e) => { e.stopPropagation(); setPointForm({ id: pv.id, number: String(pv.number), description: pv.description ?? '', enabled: pv.enabled, isDefault: pv.isDefault, enabledCbteTypes: pv.enabledCbteTypes ?? [] }); }} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                      <Edit2 size={12} /> Editar
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); askDeletePoint(pv.id); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', gap: 4 }}>
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            />
          </SectionCard>

          {/* ── CAI de remitos ── */}
          <SectionCard
            title="CAI de remitos"
            subtitle="Código de Autorización de Impresión para emitir remitos. El sistema lo asigna automáticamente a cada remito."
            icon={<FileText size={18} color="var(--accent2)" />}
            right={activeRemitoCai ? <StatusChip tone="green">CAI activo</StatusChip> : <StatusChip tone="yellow">Sin CAI activo</StatusChip>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 14, marginBottom: 14 }}>
              <HelpField label="Modo" help="Digital completo = imprime todo desde el sistema. Preimpreso = si tenés talonario autorizado.">
                <select value={remitoCaiForm.mode} onChange={e => rp('mode', e.target.value as RemitoMode)}>
                  {REMITO_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </HelpField>
              <HelpField label="Punto de venta remito" help="PV asociado al CAI de remitos.">
                <input type="number" min="1" value={remitoCaiForm.pointOfSale} onChange={e => rp('pointOfSale', e.target.value)} placeholder="1" />
              </HelpField>
              <HelpField label="CAI *" help="Código de 14 dígitos otorgado por ARCA para los remitos.">
                <input value={remitoCaiForm.cai} onChange={e => rp('cai', e.target.value)} placeholder="12345678901234" />
              </HelpField>
              <HelpField label="Vencimiento CAI *" help="Fecha hasta la cual está autorizado ese CAI.">
                <input type="date" value={remitoCaiForm.expiresAt} onChange={e => rp('expiresAt', e.target.value)} />
              </HelpField>
              <HelpField label="Desde número" help="Primer número autorizado por ese CAI.">
                <input type="number" min="1" value={remitoCaiForm.rangeFrom} onChange={e => rp('rangeFrom', e.target.value)} />
              </HelpField>
              <HelpField label="Hasta número" help="Último número autorizado por ese CAI.">
                <input type="number" min="1" value={remitoCaiForm.rangeTo} onChange={e => rp('rangeTo', e.target.value)} />
              </HelpField>
              <HelpField label="Próximo número" help="Número que usará el próximo remito. El sistema lo incrementa automáticamente.">
                <input type="number" min="1" value={remitoCaiForm.nextNumber} onChange={e => rp('nextNumber', e.target.value)} />
              </HelpField>
              <div style={{ display: 'grid', alignContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={remitoCaiForm.enabled} onChange={e => rp('enabled', e.target.checked)} style={{ width: 14, height: 14 }} />
                  CAI activo
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <button onClick={handleSaveRemitoCai} disabled={saving} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : remitoCaiForm.id ? <Save size={13} /> : <Plus size={13} />}
                {remitoCaiForm.id ? 'Actualizar CAI' : 'Agregar CAI'}
              </button>
              {remitoCaiForm.id && (
                <button onClick={() => setRemitoCaiForm(emptyRemitoCai)} className="btn btn-secondary btn-sm">Cancelar</button>
              )}
            </div>
            <ResponsiveTable
              data={remitoCais}
              keyFor={(item) => item.id}
              emptyMessage="Sin CAI de remitos cargado"
              columns={[
                { key: 'pv', header: 'PV', render: (item) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{String(item.pointOfSale).padStart(4, '0')}</span> },
                { key: 'cai', header: 'CAI', render: (item) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.cai}</span> },
                { key: 'vence', header: 'Vence', render: (item) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(item.expiresAt)}</span> },
                { key: 'rango', header: 'Rango', render: (item) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.rangeFrom ?? '—'} a {item.rangeTo ?? '—'}</span> },
                { key: 'proximo', header: 'Próximo', render: (item) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.nextNumber ?? '—'}</span> },
                {
                  key: 'estado', header: 'Estado', render: (item) => {
                    const expired = new Date(item.expiresAt).getTime() < NOW_TS;
                    return expired ? <StatusChip tone="red">Vencido</StatusChip>
                      : item.enabled ? <StatusChip tone="green">Activo</StatusChip>
                      : <StatusChip tone="gray">Inactivo</StatusChip>;
                  },
                },
                {
                  key: 'acciones', header: '', render: (item) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setRemitoCaiForm({ id: item.id, mode: item.mode, pointOfSale: String(item.pointOfSale), cai: item.cai, expiresAt: toDateInput(item.expiresAt), rangeFrom: String(item.rangeFrom ?? ''), rangeTo: String(item.rangeTo ?? ''), nextNumber: String(item.nextNumber ?? ''), enabled: item.enabled })}
                        className="btn btn-ghost btn-xs"
                      ><Edit2 size={12} /></button>
                      <button onClick={() => askDeleteRemitoCai(item.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                    </div>
                  ),
                },
              ] as ResponsiveTableColumn<RemitoCaiConfig>[]}
              renderMobileCard={(item) => {
                const expired = new Date(item.expiresAt).getTime() < NOW_TS;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="mobile-card-head">
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{String(item.pointOfSale).padStart(4, '0')}</span>
                      {expired ? <StatusChip tone="red">Vencido</StatusChip>
                        : item.enabled ? <StatusChip tone="green">Activo</StatusChip>
                        : <StatusChip tone="gray">Inactivo</StatusChip>}
                    </div>
                    <div className="mobile-card-row">
                      <span>CAI</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{item.cai}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>Vence</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{fmtDate(item.expiresAt)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>Rango</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{item.rangeFrom ?? '—'} a {item.rangeTo ?? '—'}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>Próximo</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{item.nextNumber ?? '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRemitoCaiForm({ id: item.id, mode: item.mode, pointOfSale: String(item.pointOfSale), cai: item.cai, expiresAt: toDateInput(item.expiresAt), rangeFrom: String(item.rangeFrom ?? ''), rangeTo: String(item.rangeTo ?? ''), nextNumber: String(item.nextNumber ?? ''), enabled: item.enabled }); }}
                        className="btn btn-ghost btn-xs" style={{ gap: 4 }}
                      ><Edit2 size={12} /> Editar</button>
                      <button onClick={(e) => { e.stopPropagation(); askDeleteRemitoCai(item.id); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', gap: 4 }}>
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </div>
                );
              }}
            />
          </SectionCard>

        </div>
      )}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
