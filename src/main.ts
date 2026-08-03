import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config/gameConfig';

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

new Phaser.Game(createGameConfig('phaser-game'));
