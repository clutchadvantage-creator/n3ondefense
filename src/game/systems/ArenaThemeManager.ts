import type { ArenaTheme } from '../types';
import { SeededRandom } from './SeededRandom';

const THEMES: ArenaTheme[] = [
  { id: 'cyan-purple', primary: 0x49efff, secondary: 0xa66cff, accent: 0xf8f3ff },
  { id: 'green-yellow', primary: 0x6aff92, secondary: 0xffdf61, accent: 0xf7fff0 },
  { id: 'red-orange', primary: 0xff5b67, secondary: 0xffa14b, accent: 0xfff0ea },
  { id: 'blue-magenta', primary: 0x4f8dff, secondary: 0xd65bff, accent: 0xf7edff },
  { id: 'pink-cyan', primary: 0xff63d6, secondary: 0x55e9ff, accent: 0xfff3fc }
];

export class ArenaThemeManager {
  static pick(random: SeededRandom): ArenaTheme {
    return random.pick(THEMES);
  }
}
