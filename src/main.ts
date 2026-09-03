import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config/gameConfig';
import { installMenuAudio } from './ui/installMenuAudio';
import { installUiNavigation } from './game/input/UiNavigationController.ts';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount node.');
}

app.innerHTML = `
  <div id="game-root">
    <div id="phaser-game"></div>
    <div id="game-ui-root"></div>
  </div>
`;

installMenuAudio();
installUiNavigation(document.querySelector<HTMLElement>('#game-ui-root')!);
const game = new Phaser.Game(createGameConfig('phaser-game'));

if (import.meta.env.DEV) {
  (globalThis as typeof globalThis & { n3onGame?: Phaser.Game }).n3onGame = game;
}
