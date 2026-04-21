// ── notify.js ─────────────────────────────────────────────────────────────
// Lightweight toast / notification system.
// Replaces alert() across the app with contextual, non-blocking messages.
//
// Usage:
//   notify.info('Subtitle track imported — 42 cues loaded.')
//   notify.warn('No device found yet — still scanning.')
//   notify.error('Import failed: unexpected end of JSON input')
//   notify.success('Session exported as my_session.assp')
//   notify.confirm('Delete this block?').then(ok => { if (ok) ... })

const CONTAINER_ID = 'notifyContainer';
const DURATION = { info: 3500, success: 3000, warn: 5000, error: 0 }; // 0 = sticky

function getContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    el.style.cssText = `
      position: fixed; bottom: 14px; right: 14px; z-index: 9999;
      display: flex; flex-direction: column-reverse; gap: 8px;
      max-width: 340px; pointer-events: none;
    `;
    document.body.appendChild(el);
  }
  return el;
}

const ICONS = { info: 'ℹ', success: '✓', warn: '⚠', error: '✕' };
const COLORS = {
  info:    { border: 'rgba(95,160,220,0.35)',  icon: '#5fa0dc', bg: 'rgba(95,160,220,0.1)'  },
  success: { border: 'rgba(125,200,122,0.35)', icon: '#7dc87a', bg: 'rgba(125,200,122,0.1)' },
  warn:    { border: 'rgba(240,160,74,0.4)',   icon: '#f0a04a', bg: 'rgba(240,160,74,0.1)'  },
  error:   { border: 'rgba(224,80,80,0.4)',    icon: '#e05050', bg: 'rgba(224,80,80,0.1)'   },
};

function show(type, message, duration) {
  const container = getContainer();
  const c = COLORS[type] || COLORS.info;
  const ms = duration !== undefined ? duration : DURATION[type];

  const toast = document.createElement('div');
  toast.style.cssText = `
    display: flex; align-items: flex-start; gap: 9px;
    background: #16161c; border: 0.5px solid ${c.border};
    border-left: 3px solid ${c.icon};
    border-radius: 8px; padding: 9px 12px;
    font-family: Inter, system-ui, sans-serif; font-size: 12px; line-height: 1.5;
    color: #e2e0d8; pointer-events: all;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    opacity: 0; transform: translateX(12px);
    transition: opacity 0.2s, transform 0.2s;
    cursor: ${ms === 0 ? 'pointer' : 'default'};
  `;

  const icon = document.createElement('span');
  icon.textContent = ICONS[type] || 'ℹ';
  icon.style.cssText = `color: ${c.icon}; font-size: 13px; flex-shrink: 0; margin-top: 1px;`;

  const text = document.createElement('span');
  text.style.cssText = 'flex: 1; white-space: pre-wrap; word-break: break-word;';
  text.textContent = message;

  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = `
    background: transparent; border: none; color: rgba(255,255,255,0.3);
    font-size: 15px; line-height: 1; cursor: pointer; padding: 0;
    margin: -2px -4px 0 0; flex-shrink: 0; pointer-events: all;
  `;
  close.addEventListener('click', () => dismiss(toast));

  toast.appendChild(icon);
  toast.appendChild(text);
  toast.appendChild(close);
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  // Auto-dismiss
  let timer = null;
  if (ms > 0) {
    timer = setTimeout(() => dismiss(toast), ms);
  }

  // Click sticky error to dismiss
  if (ms === 0) {
    toast.addEventListener('click', () => dismiss(toast));
  }

  function dismiss(el) {
    clearTimeout(timer);
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 220);
  }

  return toast;
}

// ── Public API ─────────────────────────────────────────────────────────────
export const notify = {
  info:    (msg, ms) => show('info',    msg, ms),
  success: (msg, ms) => show('success', msg, ms),
  warn:    (msg, ms) => show('warn',    msg, ms),
  error:   (msg, ms) => show('error',   msg, ms),   // sticky by default

  // Simple confirmation dialog (returns Promise<boolean>)
  confirm(message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.65); display: flex;
        align-items: center; justify-content: center;
        font-family: Inter, system-ui, sans-serif;
        backdrop-filter: blur(2px);
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: #16161c; border: 0.5px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 20px 22px; max-width: 360px; width: 90vw;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6);
      `;

      const msg = document.createElement('p');
      msg.textContent = message;
      msg.style.cssText = 'color: #e2e0d8; font-size: 13px; line-height: 1.6; margin-bottom: 16px;';

      const btns = document.createElement('div');
      btns.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = cancelLabel;
      cancelBtn.style.cssText = `
        padding: 6px 14px; border-radius: 6px;
        border: 0.5px solid rgba(255,255,255,0.12);
        background: transparent; color: #908e86;
        font-size: 12px; cursor: pointer; font-family: inherit;
      `;

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.style.cssText = `
        padding: 6px 14px; border-radius: 6px;
        border: 0.5px solid ${danger ? 'rgba(224,80,80,0.4)' : 'rgba(240,160,74,0.35)'};
        background: ${danger ? 'rgba(224,80,80,0.12)' : 'rgba(240,160,74,0.1)'};
        color: ${danger ? '#e05050' : '#f0a04a'};
        font-size: 12px; cursor: pointer; font-family: inherit;
      `;

      const cleanup = (result) => {
        overlay.remove();
        document.removeEventListener('keydown', _escHandler, true);
        resolve(result);
      };
      const _escHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(false); } };
      document.addEventListener('keydown', _escHandler, true);
      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });

      btns.appendChild(cancelBtn);
      btns.appendChild(confirmBtn);
      dialog.appendChild(msg);
      dialog.appendChild(btns);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      confirmBtn.focus();
    });
  },
};
