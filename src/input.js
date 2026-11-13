// Merges keyboard, gamepad, touch and XR controllers into one input state.
// Stick convention: x = right, y = forward (away from the viewer).

const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { x: 0, y: 0, pass: false, shoot: false, sprint: false, switch: false, recenter: false };
    this.prev = {};
    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this._touchUI();
  }

  _touchUI() {
    const pad = document.getElementById('stick');
    const knob = document.getElementById('knob');
    if (!pad) return;
    let id = null;
    const set = (e) => {
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      this.touch.x = x; this.touch.y = y;
      knob.style.transform = `translate(${x * 40}px, ${-y * 40}px)`;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.touch.x = this.touch.y = 0;
      knob.style.transform = '';
    };
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; pad.setPointerCapture(id); set(e); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    for (const el of document.querySelectorAll('[data-btn]')) {
      const name = el.dataset.btn;
      const on = (v) => (e) => { e.preventDefault(); this.touch[name] = v; el.classList.toggle('down', v); };
      el.addEventListener('pointerdown', on(true));
      el.addEventListener('pointerup', on(false));
      el.addEventListener('pointercancel', on(false));
      el.addEventListener('pointerleave', on(false));
    }
  }

  poll(session) {
    const k = this.keys;
    const t = this.touch;
    const s = {
      x: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + t.x,
      y: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + t.y,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || t.sprint,
      passDown: k.has('Space') || t.pass,
      shootDown: k.has('KeyF') || k.has('KeyJ') || t.shoot,
      switchDown: k.has('KeyQ') || k.has('Tab') || k.has('KeyE') || t.switch,
      recenterDown: k.has('KeyR') || t.recenter,
      startDown: k.has('Enter'),
      rotate: 0,
      lift: 0,
    };

    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!gp || gp.mapping !== 'standard') continue;
      const b = (i) => !!gp.buttons[i]?.pressed;
      s.x += dead(gp.axes[0] || 0);
      s.y -= dead(gp.axes[1] || 0);
      s.passDown ||= b(0);
      s.shootDown ||= b(1) || b(2);
      s.switchDown ||= b(3) || b(4);
      s.sprint ||= b(5) || b(7);
      s.startDown ||= b(9);
    }

    if (session) {
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue;
        const b = (i) => !!gp.buttons[i]?.pressed;
        const ax = dead(gp.axes[2] || 0);
        const ay = dead(gp.axes[3] || 0);
        if (src.handedness === 'left') {
          s.x += ax; s.y -= ay;
          s.sprint ||= b(0);
          s.switchDown ||= b(4) || b(5);
        } else if (src.handedness === 'right') {
          s.rotate += ax; s.lift -= ay;
          s.shootDown ||= b(0);
          s.passDown ||= b(4);
          s.switchDown ||= b(5);
          s.recenterDown ||= b(3);
        }
      }
    }

    const m = Math.hypot(s.x, s.y);
    if (m > 1) { s.x /= m; s.y /= m; }
    for (const name of ['pass', 'switch', 'recenter', 'start']) {
      s[name] = s[`${name}Down`] && !this.prev[name];
      this.prev[name] = s[`${name}Down`];
    }
    s.any = m > 0.2 || s.passDown || s.shootDown || s.switchDown;
    return s;
  }
}
