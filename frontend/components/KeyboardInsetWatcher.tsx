'use client';

import { useEffect } from 'react';

// Cuando el teclado en pantalla se abre en mobile, el layout viewport (contra
// el que se posicionan los elementos position:fixed, como .modal-overlay/
// .modal en globals.css) NO se achica en la mayoria de los navegadores -- el
// teclado se dibuja simplemente ENCIMA, tapando lo que haya ahi abajo. Los
// modales tipo bottom-sheet (anclados a bottom:0) quedaban con su input
// activo y el footer con los botones de accion tapados por el teclado, sin
// forma de llegar a ellos (ver "Nueva categoria" y los demas -- son ~28
// pantallas que usan el mismo .modal-overlay/.modal compartido).
//
// window.visualViewport SI refleja el alto real visible (descontando el
// teclado) en los navegadores donde existe (Safari 13+, Chrome moderno).
// Este componente mide esa diferencia y la publica como una CSS var global
// (--keyboard-inset) que .modal usa en globals.css para subirse y achicarse
// justo lo necesario -- no hace falta tocar cada modal por separado.
export default function KeyboardInsetWatcher() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // offsetTop cubre el caso de que el viewport visual tambien se haya
      // corrido hacia abajo (algunos navegadores lo hacen al hacer scroll
      // con el teclado abierto), no solo achicado.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return null;
}
