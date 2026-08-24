export const WHATSAPP_NUMBER = '5493546541413';
export const WHATSAPP_MESSAGE = '¡Hola! Quiero conocer más sobre ComarPOS para mi negocio.';
export const waLink = (extra?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(extra ?? WHATSAPP_MESSAGE)}`;

export const CONTACT_EMAIL = 'info.comarpos@gmail.com';
