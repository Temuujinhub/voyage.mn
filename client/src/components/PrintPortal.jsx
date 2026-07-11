import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Renders children into a body-level .print-area and drives window.print().
// pageSize sets @page (e.g. "187mm 84mm" for passes, "470mm 51mm" for tags —
// the Fujitsu tag printer driver picks this up as the media size).
export default function PrintPortal({ pageSize, onDone, children }) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.className = 'print-area';
    return el;
  });

  useEffect(() => {
    document.body.appendChild(host);
    const style = document.createElement('style');
    style.textContent = `@page { size: ${pageSize}; margin: 0; }`;
    document.head.appendChild(style);
    document.body.classList.add('print-mode');

    const after = () => {
      document.body.classList.remove('print-mode');
      onDone?.();
    };
    window.addEventListener('afterprint', after);
    const t = setTimeout(() => window.print(), 150);

    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('print-mode');
      style.remove();
      host.remove();
    };
  }, [host, pageSize]);

  return createPortal(children, host);
}
