'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { LAUNCH_PRICE_ENDS_AT } from './plans';

function timeLeft(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return { ms, days, hours, minutes };
}

// Countdown en vivo del precio de lanzamiento. Se actualiza cada minuto (no
// cada segundo -- el conteo son dias, un tick de 1s solo prendería el
// ventilador de la pestaña sin que se note ningun cambio visual). Se monta
// en cliente para evitar el mismatch de hidratacion que daria calcular
// "ahora" en el server: el HTML estatico que manda el server queda con el
// numero de la hora del render, y el primer render en el browser (con la
// hora real del visitante) tiene que pisarlo sin que React se queje --
// arranca en null y recien pinta el numero en el primer effect.
export default function LaunchCountdown() {
  const [left, setLeft] = useState<ReturnType<typeof timeLeft> | null>(null);

  useEffect(() => {
    setLeft(timeLeft(LAUNCH_PRICE_ENDS_AT));
    const id = setInterval(() => setLeft(timeLeft(LAUNCH_PRICE_ENDS_AT)), 60000);
    return () => clearInterval(id);
  }, []);

  if (!left || left.ms <= 0) return null;

  const parts = [
    left.days > 0 ? `${left.days}d` : null,
    `${left.hours}h`,
    `${left.minutes}m`,
  ].filter(Boolean);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
      color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border2)',
      borderRadius: 999, padding: '5px 14px', fontFamily: 'var(--mono)',
    }}>
      <Clock size={12} />
      Quedan {parts.join(' ')} de precio de lanzamiento
    </div>
  );
}
