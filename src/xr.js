import * as THREE from 'three';
import { TABLE_HEIGHT } from './view.js';

// Handles entering AR / VR, placing the table in front of the player, and
// moving it around (right stick = rotate / raise, grip = grab and drag).
export class XR {
  constructor(renderer, scene, table, room, background) {
    Object.assign(this, { renderer, scene, table, room, background });
    this.mode = null;
    this.needsPlacement = false;
    this.grab = {};
    renderer.xr.enabled = true;
    this._buttons();
  }

  get session() {
    return this.renderer.xr.getSession();
  }

  async _buttons() {
    const wrap = document.getElementById('xr-buttons');
    const note = document.getElementById('xr-note');
    const xr = navigator.xr;
    const modes = [['immersive-ar', 'Enter AR'], ['immersive-vr', 'Enter VR']];
    let any = false;
    for (const [mode, label] of modes) {
      let ok = false;
      try { ok = !!xr && (await xr.isSessionSupported(mode)); } catch { ok = false; }
      if (!ok) continue;
      any = true;
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.onclick = () => this.start(mode).catch((e) => { note.textContent = `Could not start ${label.slice(6)}: ${e.message}`; });
      wrap.appendChild(btn);
    }
    if (!any) {
      note.textContent = xr
        ? 'No AR/VR device found here, so this is the flat-screen view.'
        : 'This browser has no WebXR, so this is the flat-screen view. Open it on a Quest or Android phone for AR.';
    }
  }

  async start(mode) {
    const ar = mode === 'immersive-ar';
    const init = { requiredFeatures: ['local-floor'] };
    if (ar) {
      init.optionalFeatures = ['dom-overlay'];
      init.domOverlay = { root: document.getElementById('overlay') };
    }
    const session = await navigator.xr.requestSession(mode, init);
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);
    this.mode = ar ? 'ar' : 'vr';
    this.needsPlacement = true;
    this.room.visible = !ar;
    this.scene.background = ar ? null : this.background;
    document.body.classList.add('in-xr');
    session.addEventListener('end', () => {
      this.mode = null;
      this.grab = {};
      this.room.visible = true;
      this.scene.background = this.background;
      this.table.position.set(0, TABLE_HEIGHT, 0);
      this.table.rotation.set(0, 0, 0);
      document.body.classList.remove('in-xr');
    });
  }

  recenter() {
    this.needsPlacement = true;
  }

  update(frame, input, dt) {
    if (!this.mode || !frame) return;
    const cam = this.renderer.xr.getCamera();

    if (this.needsPlacement) {
      const pos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      if (pos.lengthSq() > 1e-6) {
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
        fwd.normalize();
        this.table.position.copy(pos).addScaledVector(fwd, 0.8);
        this.table.position.y = Math.max(0.35, pos.y - 0.55);
        // pitch length runs left-to-right across the player's view
        this.table.rotation.y = Math.atan2(fwd.x, -fwd.z) * -1;
        this.needsPlacement = false;
      }
    }

    this.table.rotation.y -= input.rotate * dt * 1.5;
    this.table.position.y = THREE.MathUtils.clamp(this.table.position.y + input.lift * dt * 0.4, 0.05, 2);

    const ref = this.renderer.xr.getReferenceSpace();
    for (const src of this.session.inputSources) {
      if (!src.gripSpace || !src.gamepad) continue;
      const held = !!src.gamepad.buttons[1]?.pressed;
      const pose = held ? frame.getPose(src.gripSpace, ref) : null;
      if (!pose) { delete this.grab[src.handedness]; continue; }
      const p = pose.transform.position;
      const last = this.grab[src.handedness];
      if (last) {
        this.table.position.x += p.x - last.x;
        this.table.position.y += p.y - last.y;
        this.table.position.z += p.z - last.z;
      }
      this.grab[src.handedness] = { x: p.x, y: p.y, z: p.z };
    }
  }
}
