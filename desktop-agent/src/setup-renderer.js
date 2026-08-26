(async () => {
  const viewPair = document.getElementById('view-pair');
  const viewPaired = document.getElementById('view-paired');
  const pairError = document.getElementById('pair-error');
  const pairCode = document.getElementById('pair-code');
  const btnPair = document.getElementById('btn-pair');
  const deviceName = document.getElementById('device-name');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const printerSelect = document.getElementById('printer-select');
  const paperWidthSelect = document.getElementById('paper-width-select');
  const btnTestPrint = document.getElementById('btn-test-print');
  const printLog = document.getElementById('print-log');
  const btnUnpair = document.getElementById('btn-unpair');

  function showPaired(state) {
    viewPair.classList.add('hidden');
    viewPaired.classList.remove('hidden');
    deviceName.textContent = state.deviceName || 'ComarPOS Agent';
  }

  function showPairForm() {
    viewPair.classList.remove('hidden');
    viewPaired.classList.add('hidden');
  }

  async function loadPrinters(selected) {
    const printers = await window.agent.listPrinters();
    printerSelect.innerHTML = '';
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.displayName + (p.isDefault ? ' (predeterminada)' : '');
      printerSelect.appendChild(opt);
    }
    if (selected && printers.some((p) => p.name === selected)) {
      printerSelect.value = selected;
      return;
    }
    // Sin impresora guardada todavía (primer pairing): arrancamos con la
    // predeterminada de Windows y la guardamos, para no dejar el agente
    // "vinculado pero sin imprimir en ningún lado" hasta que alguien entre
    // a elegir una a mano.
    const def = printers.find((p) => p.isDefault) || printers[0];
    if (def) {
      printerSelect.value = def.name;
      const { paperWidthMm } = await window.agent.setPrinter(def.name);
      paperWidthSelect.value = String(paperWidthMm);
    }
  }

  printerSelect.addEventListener('change', async () => {
    const { paperWidthMm } = await window.agent.setPrinter(printerSelect.value);
    paperWidthSelect.value = String(paperWidthMm);
  });

  paperWidthSelect.addEventListener('change', () => {
    window.agent.setPaperWidth(paperWidthSelect.value);
  });

  btnPair.addEventListener('click', async () => {
    const code = pairCode.value.trim();
    if (code.length !== 6) {
      pairError.textContent = 'El código tiene 6 dígitos.';
      return;
    }
    btnPair.disabled = true;
    pairError.textContent = '';
    try {
      const state = await window.agent.pair(code);
      showPaired(state);
      await loadPrinters(state.printerName);
    } catch (err) {
      pairError.textContent = err?.message || 'No se pudo vincular. Revisá el código.';
    } finally {
      btnPair.disabled = false;
    }
  });

  pairCode.addEventListener('input', () => {
    pairCode.value = pairCode.value.replace(/\D/g, '').slice(0, 6);
  });

  btnTestPrint.addEventListener('click', async () => {
    btnTestPrint.disabled = true;
    printLog.textContent = 'Imprimiendo…';
    try {
      await window.agent.testPrint();
      printLog.textContent = 'Ticket de prueba enviado a la impresora.';
    } catch (err) {
      printLog.textContent = `Error: ${err?.message || 'no se pudo imprimir'}`;
    } finally {
      btnTestPrint.disabled = false;
    }
  });

  btnUnpair.addEventListener('click', async () => {
    if (!confirm('¿Desvincular este agente? Vas a tener que emparejarlo de nuevo desde el panel.')) return;
    await window.agent.unpair();
    showPairForm();
    pairCode.value = '';
  });

  window.agent.onStatus((status) => {
    if (status.type === 'connected') {
      statusDot.className = 'dot ok';
      statusText.textContent = 'Conectado';
    } else if (status.type === 'unpaired') {
      statusDot.className = 'dot';
      statusText.textContent = 'Sin vincular';
    } else if (status.type === 'error') {
      statusDot.className = 'dot err';
      statusText.textContent = 'Sin conexión';
    } else if (status.type === 'printed') {
      printLog.textContent = `Último ticket impreso: ${status.saleId}`;
    }
  });

  const state = await window.agent.getState();
  if (state.deviceId) {
    showPaired(state);
    paperWidthSelect.value = String(state.paperWidthMm || 80);
    await loadPrinters(state.printerName);
  } else {
    showPairForm();
  }
})();
