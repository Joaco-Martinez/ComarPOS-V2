'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { normalizeArray, fmtDate } from '@/lib/helpers';
import type { Notification } from '@/types';
import { Bell, CheckCheck, AlertTriangle, Wallet, Target, Tag, Wallet as CashIcon, Info, Rocket, Printer } from 'lucide-react';

const ICONS: Record<Notification['type'], typeof AlertTriangle> = {
  LOW_STOCK: AlertTriangle,
  DEBT_ALERT: Wallet,
  GOAL_REACHED: Target,
  PROMOTION_EXPIRING: Tag,
  CASH_SESSION_OPEN: CashIcon,
  SYSTEM: Info,
  ONBOARDING_PENDING: Rocket,
  PRINTER_NOT_CONFIGURED: Printer,
};

export default function NotificationsBell() {
  const router = useRouter();
  const { tenant } = useParams<{ tenant: string }>();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadUnread = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnread(typeof data === 'number' ? data : data?.count ?? 0);
    } catch {
      /* silencioso: no bloquear el resto del header */
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      setItems(normalizeArray<Notification>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const markRead = async (id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((p) => Math.max(0, p - 1));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      loadList();
      loadUnread();
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead(n.id);
    const href = n.data?.href;
    if (typeof href === 'string') {
      setOpen(false);
      router.push(`/${tenant}${href}`);
    }
  };

  const markAllRead = async () => {
    setItems((p) => p.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      loadList();
      loadUnread();
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} className="btn btn-ghost btn-sm" style={{ padding: 7, position: 'relative' }}>
        <Bell size={15} style={{ color: 'var(--text3)' }} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7,
            background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxWidth: '90vw',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)', zIndex: 60, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Notificaciones</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="btn btn-ghost btn-xs" style={{ gap: 4, fontSize: 11 }}>
                <CheckCheck size={11} /> Marcar todas
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
            ) : items.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>Sin notificaciones</div>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px',
                      borderBottom: '1px solid var(--border)', background: n.isRead ? 'transparent' : 'rgba(13,89,231,0.06)',
                      cursor: 'pointer', border: 'none', borderBottomWidth: 1,
                    }}
                  >
                    <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{n.body}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{fmtDate(n.createdAt)}</div>
                    </div>
                    {!n.isRead && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
