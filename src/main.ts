import Phaser from 'phaser';
import { Runtime } from './game/runtime';
import { WorldScene } from './render/WorldScene';
import { Interface } from './ui/interface';
import './style.css';

const runtime = new Runtime();
const scene = new WorldScene(runtime);
new Interface(runtime, () => scene);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'world',
  backgroundColor: '#61776b',
  antialias: true,
  powerPreference: 'low-power',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  fps: { target: 60, forceSetTimeOut: false },
  render: { pixelArt: false, roundPixels: false, transparent: false },
  scene: [scene],
  audio: { noAudio: true },
  banner: false,
});

// A development-only inspection port for browser QA. Never shipped by Vite.
if (import.meta.env.DEV) Object.assign(window, { __KINGNAMIC__: { runtime, scene, game } });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) runtime.notify('An updated build is ready. Save and reload when convenient.', 'info');
    controlled = true;
  });
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(() => runtime.notify('Offline installation was unavailable. Local saves still work.', 'warn')); });
}
