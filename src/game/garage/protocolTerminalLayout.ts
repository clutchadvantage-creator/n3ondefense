export interface ProtocolTerminalVerticalLayout {
  switchButtonHeight: number;
  switchRowY: number;
  cardsTop: number;
  cardsBottom: number;
}

/**
 * Anchors terminal controls to the panel's real content region rather than a
 * viewport-specific Y offset. Header, switch row, and cards always retain
 * explicit positive gaps as the viewport height changes.
 */
export const calculateProtocolTerminalVerticalLayout = (
  frameTop: number,
  frameHeight: number,
  frameHeaderHeight: number,
  compact: boolean
): ProtocolTerminalVerticalLayout => {
  const headerGap = compact ? 9 : 14;
  const switchButtonHeight = compact ? 34 : 40;
  const cardsGap = compact ? 11 : 18;
  const bottomInset = compact ? 10 : 16;
  const switchTop = frameTop + frameHeaderHeight + headerGap;
  return {
    switchButtonHeight,
    switchRowY: switchTop + switchButtonHeight / 2,
    cardsTop: switchTop + switchButtonHeight + cardsGap,
    cardsBottom: frameTop + frameHeight - bottomInset
  };
};

