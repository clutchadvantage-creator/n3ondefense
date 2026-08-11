export interface GaragePoint { x: number; y: number }
export interface GarageRect { x: number; y: number; width: number; height: number }
export interface GarageLayout {
  safe: number;
  compact: boolean;
  cardWidth: number;
  cardHeight: number;
  dockCenters: GaragePoint[];
  stationCenters: GaragePoint[];
  stationWidth: number;
  configTerminal: GarageRect;
  walletTerminal: GarageRect;
  operatorPreview: GarageRect;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export const calculateGarageLayout = (width: number, height: number): GarageLayout => {
  const safe = Math.round(clamp(Math.min(width, height) * 0.022, 10, 22));
  const compact = width < 900 || height < 620;
  const dockGap = clamp(width * 0.009, 6, 13);
  const cardWidth = Math.floor(clamp((width - safe * 2 - dockGap * 4) / 5, 84, compact ? 118 : 132));
  const cardHeight = Math.round(cardWidth * 1.4);
  const totalDockWidth = cardWidth * 5 + dockGap * 4;
  const dockStartX = (width - totalDockWidth) / 2 + cardWidth / 2;
  const dockY = clamp(height * (compact ? 0.56 : 0.52), 224, height - 128);
  const stationGap = clamp(width * 0.01, 6, 14);
  const stationWidth = Math.floor(clamp((width - safe * 2 - stationGap * 4) / 5, 96, 190));
  const totalStationWidth = stationWidth * 5 + stationGap * 4;
  const stationStartX = (width - totalStationWidth) / 2 + stationWidth / 2;
  const terminalWidth = Math.floor(clamp(width * 0.19, 164, 245));
  const terminalHeight = compact ? 92 : 146;
  const terminalY = 68;
  const previewWidth = Math.floor(clamp(width * 0.22, 150, 260));
  return {
    safe,
    compact,
    cardWidth,
    cardHeight,
    dockCenters: Array.from({ length: 5 }, (_, index) => ({ x: dockStartX + index * (cardWidth + dockGap), y: dockY })),
    stationCenters: Array.from({ length: 5 }, (_, index) => ({ x: stationStartX + index * (stationWidth + stationGap), y: height - safe - 20 })),
    stationWidth,
    configTerminal: { x: safe, y: terminalY, width: terminalWidth, height: terminalHeight },
    walletTerminal: { x: width - safe - terminalWidth, y: terminalY, width: terminalWidth, height: terminalHeight },
    operatorPreview: { x: width / 2 - previewWidth / 2, y: 76, width: previewWidth, height: compact ? 78 : 132 }
  };
};
