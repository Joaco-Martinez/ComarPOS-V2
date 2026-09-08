/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { PrintboxFirmware, PrintboxBoard } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { Cpu, Plus, X, Trash2, Download, UploadCloud } from 'lucide-react';

const BOARD_LABEL: Record<PrintboxBoard, string> = {
  ESP32_S3: 'ESP32-S3-DevKitC-1',
  ESP32_CLASSIC: 'ESP32 clásico (DevKitV1)',
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const emptyForm = { board: 'ESP32_CLASSIC' as PrintboxBoard, version: '', notes: '' };

export default function PrintboxFirmwarePage() {
  const [firmwares, setFirmwares] = useState<PrintboxFirmware[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform-admin/printbox-firmware');
      setFirmwares(normalizeArray<PrintboxFirmware>(data.firmwares ?? data));
    } catch {
      toast.error('No se pudieron cargar los firmwares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    // sugiere la version siguiente para el board que ya esta seleccionado
    const board = form.board;
    const nextVersion = Math.max(0, ...firmwares.filter((f) => f.board === board).map((f) => f.version)) + 1;
    setForm({ board, version: String(nextVersion), notes: '' });
    setFile(null);
    setProgress(0);
    setModal(true);
  };

  const changeBoard = (board: PrintboxBoard) => {
    const nextVersion = Math.max(0, ...firmwares.filter((f) => f.board === board).map((f) => f.version)) + 1;
    setForm((p) => ({ ...p, board, version: String(nextVersion) }));
  };

  const publish = async () => {
    if (!file || !form.version.trim()) return;
    setPublishing(true);
    setProgress(0);
    try {
      const body = new FormData();
      body.append('board', form.board);
      body.append('version', form.version.trim());
      if (form.notes.trim()) body.append('notes', form.notes.trim());
      body.append('firmware', file);

      await api.post('/platform-admin/printbox-firmware', body, {
        onUploadProgress: (evt) => {
          setProgress(Math.round((evt.loaded * 100) / (evt.total || file.size)));
        },
      });

      toast.success('Firmware publicado — los devices emparejados lo van a detectar solos en su próximo chequeo');
      setModal(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al publicar el firmware');
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (fw: PrintboxFirmware) => {
    if (!confirm(`¿Borrar ${BOARD_LABEL[fw.board]} v${fw.version} del catálogo? Esto no afecta a devices que ya la tengan instalada.`)) return;
    setRemoving(fw.id);
    try {
      await api.delete(`/platform-admin/printbox-firmware/${fw.id}`);
      toast.success('Firmware eliminado');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo eliminar');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <PlatformAdminLayout
      title="Firmware PrintBox"
      subtitle="Catálogo de versiones OTA — los ESP32 emparejados las descubren solos (GET /firmware-check) y se autoactualizan por WiFi"
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Publicar versión
        </button>
      }
    >
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : firmwares.length === 0 ? (
          <div className="empty-state" style={{ padding: 60 }}>
            <Cpu size={28} />
            <p>Todavía no publicaste ningún firmware</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Compilá con <code>pio run</code> en <code>printbox/</code> y subí el <code>.bin</code> resultante.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Versión</th>
                  <th>Tamaño</th>
                  <th>SHA256</th>
                  <th>Notas</th>
                  <th>Publicado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((fw) => (
                  <tr key={fw.id}>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{BOARD_LABEL[fw.board]}</td>
                    <td style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' }}>v{fw.version}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{formatBytes(fw.sizeBytes)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }} title={fw.sha256}>
                      {fw.sha256.slice(0, 12)}…
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 260, whiteSpace: 'pre-wrap' }}>{fw.notes || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(fw.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <a href={fw.fileUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" title="Descargar .bin">
                          <Download size={12} />
                        </a>
                        <button
                          onClick={() => remove(fw)}
                          disabled={removing === fw.id}
                          className="btn btn-ghost btn-xs"
                          style={{ color: 'var(--danger)' }}
                          title="Eliminar del catálogo"
                        >
                          {removing === fw.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => !publishing && setModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Publicar versión de firmware</span>
              <button onClick={() => setModal(false)} disabled={publishing} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Placa *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['ESP32_CLASSIC', 'ESP32_S3'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => changeBoard(b)}
                      className={form.board === b ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      style={{ flex: 1 }}
                    >
                      {BOARD_LABEL[b]}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Tiene que coincidir con el env de PlatformIO con el que compilaste (<code>esp32-classic</code> o <code>esp32-s3</code>) — un binario de la placa equivocada no bootea (pines distintos).
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Versión *</label>
                <input
                  type="number"
                  min={1}
                  value={form.version}
                  onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
                  placeholder="Ej. 2"
                />
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Tiene que ser mayor a <code>FIRMWARE_VERSION</code> del build anterior para ese board, y coincidir con el que pusiste en <code>main.cpp</code> antes de compilar.
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Archivo .bin *</label>
                <input
                  type="file"
                  accept=".bin"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  <code>printbox/.pio/build/&lt;env&gt;/firmware.bin</code>, generado por <code>pio run</code>.
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas (opcional)</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Qué cambió en esta versión..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {publishing && (
                <div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>Subiendo... {progress}%</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(false)} disabled={publishing} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={publish}
                disabled={publishing || !file || !form.version.trim()}
                className="btn btn-primary btn-sm"
                style={{ gap: 6 }}
              >
                {publishing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UploadCloud size={13} />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
