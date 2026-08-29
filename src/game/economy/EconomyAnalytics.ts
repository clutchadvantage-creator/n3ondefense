import { COSMETICS, getCosmeticPurchaseCosts } from '../../data/cosmetics.ts';
import { UPGRADE_DEFINITIONS, getUpgradeCost, getUpgradeLevel } from '../../data/upgrades.ts';
import { ANOMALY_ENTRY_COSTS } from '../anomalies/AnomalyRegistry.ts';
import { MOD_BY_ID } from '../mods/definitions.ts';
import { getModUpgradeCost } from '../mods/ModInventoryService.ts';
import { MOD_INFUSIONS } from '../mods/infusions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import type { ModRarity } from '../mods/types.ts';
import type { LocalPlayerSave } from '../save/LocalSaveTypes.ts';
import type { CosmeticOption, UpgradeDefinition } from '../types.ts';
import {
  CURRENCY_EXCHANGE_RATES,
  getCurrencyExchangeRate,
  type ExchangeBalances,
  type ExchangeCurrency
} from './CurrencyExchange.ts';

export interface EconomyValuePoint { label: string; value: number; secondary?: number; detail?: string; color: number }

export interface EconomyPortfolioEntry {
  currency: ExchangeCurrency;
  label: string;
  purpose: string;
  balance: number;
  creditEquivalent: number;
  percentage: number;
  color: number;
}

export interface EconomyUpgradeCategory {
  id: UpgradeDefinition['category'];
  label: string;
  currentLevels: number;
  maximumLevels: number;
  completionPercentage: number;
  remainingCredits: number;
}

export interface EconomyStoreAnalytics {
  owned: number;
  total: number;
  completionPercentage: number;
  affordableNow: number;
  affordableByPrimaryCurrency: Record<'credits' | 'coreTokens' | 'plasmaChips', number>;
  remainingCatalogCost: { credits: number; coreTokens: number; plasmaChips: number; creditEquivalent: number };
  cheapestUnowned: { label: string; creditEquivalent: number; price: string } | null;
  mostExpensiveAffordable: { label: string; creditEquivalent: number; price: string } | null;
  categories: Array<{
    id: CosmeticOption['category'];
    label: string;
    count: number;
    owned: number;
    affordable: number;
    minimumCreditEquivalent: number;
    averageCreditEquivalent: number;
    maximumCreditEquivalent: number;
  }>;
  priceCurve: EconomyValuePoint[];
}

export interface EconomyUpgradeAnalytics {
  currentLevels: number;
  maximumLevels: number;
  completionPercentage: number;
  remainingCredits: number;
  affordableActions: number;
  nextUpgrade: { label: string; level: number; cost: number } | null;
  mostExpensiveRemaining: { label: string; level: number; cost: number } | null;
  categories: EconomyUpgradeCategory[];
  costCurve: EconomyValuePoint[];
}

export interface EconomyModAnalytics {
  ownedDefinitions: number;
  cardCount: number;
  maxRankCards: number;
  upgradeableCards: number;
  affordableUpgradeActions: number;
  remainingCredits: number;
  remainingCoreTokens: number;
  remainingCreditEquivalent: number;
  byRarity: Array<{
    id: string;
    label: string;
    cards: number;
    remainingCreditEquivalent: number;
    affordableActions: number;
  }>;
  costCurve: EconomyValuePoint[];
}

export interface EconomyInfusionAnalytics {
  plasmaBalance: number;
  installedCount: number;
  uninfusedEligibleCards: number;
  affordableOptions: number;
  minimumInstallCost: number;
  maximumInstallCost: number;
  averageInstallCost: number;
  minimumCostInstallsAffordable: number;
  averageCostInstallsAffordable: number;
  swapsAffordable: number;
  removalsAffordable: number;
  swapCost: number;
  removalCost: number;
  costs: EconomyValuePoint[];
}

export interface EconomyAnalyticsSnapshot {
  wallet: ExchangeBalances;
  portfolio: EconomyPortfolioEntry[];
  totalPortfolioCreditEquivalent: number;
  store: EconomyStoreAnalytics;
  upgrades: EconomyUpgradeAnalytics;
  mods: EconomyModAnalytics;
  infusions: EconomyInfusionAnalytics;
  finiteProgression: EconomyValuePoint[];
  purchasingPower: {
    permanentUpgradeActions: number;
    cosmetics: number;
    modUpgradeActions: number;
    initialInfusionOptions: number;
    infusionSwaps: number;
    anomalyEntriesAtMinimum: number;
    anomalyEntriesAtMaximum: number;
    anomalyMinimumCost: number;
    anomalyMaximumCost: number;
  };
  intel: Array<{ label: string; value: string; detail: string; color: number }>;
  ticker: string[];
}

const CURRENCY_META: Record<ExchangeCurrency, { label: string; purpose: string; color: number }> = {
  credits: { label: 'CREDITS', purpose: 'GENERAL ECONOMY', color: 0x65f5ff },
  coreTokens: { label: 'CORE TOKENS', purpose: 'PREMIUM COSMETICS / MOD RANKS', color: 0xffcc62 },
  plasmaChips: { label: 'PLASMA CHIPS', purpose: 'MOD INFUSION / SPECIALTY', color: 0xd779ff },
  fluxCores: { label: 'FLUX CORES', purpose: 'ANOMALY / HIGH-VALUE RESERVE', color: 0x72ff9b }
};

const COSMETIC_CATEGORY_LABELS: Record<CosmeticOption['category'], string> = {
  playerColor: 'Operative Colors', playerShape: 'Operative Frames', projectileColor: 'Projectile Colors',
  projectileShape: 'Projectile Shapes', trailColor: 'Trails', bombColor: 'Bombsites',
  turretSkin: 'Turrets', fenceStyle: 'Fences', dashTrail: 'Dash Trails'
};

const UPGRADE_CATEGORY_LABELS: Record<UpgradeDefinition['category'], string> = {
  player: 'Operative', weapon: 'Weapon', fence: 'Fence', turret: 'Turret', mine: 'Mine'
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'corrupted', 'legendary', 'supreme'] as const;
const RARITY_COLORS: Record<(typeof RARITY_ORDER)[number], number> = {
  common: 0xbcd5de, uncommon: 0x63ff9b, rare: 0x51c8ff, epic: 0xc86aff,
  corrupted: 0xff4fc8, legendary: 0xffb43f, supreme: 0xfff16a
};

export const getCreditEquivalentRate = (currency: ExchangeCurrency): number => {
  if (currency === 'credits') return 1;
  const liquidation = getCurrencyExchangeRate(currency, 'credits');
  return liquidation ? liquidation.targetUnits / liquidation.sourceUnits : 0;
};

export const getCreditEquivalentValue = (
  values: Partial<Record<ExchangeCurrency, number>>
): number => (Object.entries(values) as Array<[ExchangeCurrency, number]>).reduce(
  (sum, [currency, amount]) => sum + Math.max(0, amount) * getCreditEquivalentRate(currency), 0
);

export const getExchangeRoundTrip = (source: ExchangeCurrency, target: ExchangeCurrency) => {
  const forward = getCurrencyExchangeRate(source, target);
  const reverse = getCurrencyExchangeRate(target, source);
  if (!forward || !reverse) return null;
  const retention = (forward.targetUnits / forward.sourceUnits) * (reverse.targetUnits / reverse.sourceUnits);
  return {
    forward,
    reverse,
    retentionPercentage: Math.round(retention * 10_000) / 100,
    spreadPercentage: Math.round((1 - retention) * 10_000) / 100
  };
};

const cosmeticPrice = (item: CosmeticOption): { credits: number; coreTokens: number; plasmaChips: number; creditEquivalent: number } => {
  const costs = getCosmeticPurchaseCosts(item);
  return { ...costs, creditEquivalent: getCreditEquivalentValue(costs) };
};

const canAffordCosmetic = (item: CosmeticOption, wallet: ExchangeBalances): boolean => {
  const cost = getCosmeticPurchaseCosts(item);
  return wallet.credits >= cost.credits && wallet.coreTokens >= cost.coreTokens && wallet.plasmaChips >= cost.plasmaChips;
};

const formatCosmeticPrice = (item: CosmeticOption): string => {
  const costs = getCosmeticPurchaseCosts(item);
  const entries = [
    costs.credits ? `${costs.credits.toLocaleString()} CR` : '',
    costs.coreTokens ? `${costs.coreTokens.toLocaleString()} CT` : '',
    costs.plasmaChips ? `${costs.plasmaChips.toLocaleString()} PC` : ''
  ].filter(Boolean);
  return entries.join(' + ') || 'FREE';
};

const buildStoreAnalytics = (save: LocalPlayerSave, wallet: ExchangeBalances): EconomyStoreAnalytics => {
  const ownedIds = new Set(save.cosmetics.owned);
  const unowned = COSMETICS.filter((item) => !ownedIds.has(item.id));
  const affordable = unowned.filter((item) => canAffordCosmetic(item, wallet));
  const remainingCatalogCost = unowned.reduce((total, item) => {
    const cost = cosmeticPrice(item);
    total.credits += cost.credits; total.coreTokens += cost.coreTokens; total.plasmaChips += cost.plasmaChips;
    total.creditEquivalent += cost.creditEquivalent;
    return total;
  }, { credits: 0, coreTokens: 0, plasmaChips: 0, creditEquivalent: 0 });
  const pricedUnowned = unowned.map((item) => ({ item, ...cosmeticPrice(item) })).sort((a, b) => a.creditEquivalent - b.creditEquivalent);
  const pricedAffordable = affordable.map((item) => ({ item, ...cosmeticPrice(item) })).sort((a, b) => b.creditEquivalent - a.creditEquivalent);
  const categories = Array.from(new Set(COSMETICS.map((item) => item.category))).map((category) => {
    const items = COSMETICS.filter((item) => item.category === category);
    const prices = items.map((item) => cosmeticPrice(item).creditEquivalent).sort((a, b) => a - b);
    return {
      id: category,
      label: COSMETIC_CATEGORY_LABELS[category],
      count: items.length,
      owned: items.filter((item) => ownedIds.has(item.id)).length,
      affordable: items.filter((item) => !ownedIds.has(item.id) && canAffordCosmetic(item, wallet)).length,
      minimumCreditEquivalent: prices[0] ?? 0,
      averageCreditEquivalent: prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : 0,
      maximumCreditEquivalent: prices.at(-1) ?? 0
    };
  });
  const allPrices = COSMETICS.map((item) => ({ label: item.label, value: cosmeticPrice(item).creditEquivalent }))
    .sort((a, b) => a.value - b.value);
  return {
    owned: COSMETICS.filter((item) => ownedIds.has(item.id)).length,
    total: COSMETICS.length,
    completionPercentage: COSMETICS.length ? Math.round(COSMETICS.filter((item) => ownedIds.has(item.id)).length / COSMETICS.length * 1000) / 10 : 100,
    affordableNow: affordable.length,
    affordableByPrimaryCurrency: {
      credits: affordable.filter((item) => item.currency === 'credits').length,
      coreTokens: affordable.filter((item) => item.currency === 'coreTokens').length,
      plasmaChips: affordable.filter((item) => item.currency === 'plasmaChips').length
    },
    remainingCatalogCost,
    cheapestUnowned: pricedUnowned[0] ? { label: pricedUnowned[0].item.label, creditEquivalent: pricedUnowned[0].creditEquivalent, price: formatCosmeticPrice(pricedUnowned[0].item) } : null,
    mostExpensiveAffordable: pricedAffordable[0] ? { label: pricedAffordable[0].item.label, creditEquivalent: pricedAffordable[0].creditEquivalent, price: formatCosmeticPrice(pricedAffordable[0].item) } : null,
    categories,
    priceCurve: allPrices.map((point, index) => ({ ...point, color: index % 2 ? 0xff65c8 : 0x62efff }))
  };
};

const remainingUpgradeSteps = (definition: UpgradeDefinition, currentLevel: number): Array<{ level: number; cost: number }> => (
  Array.from({ length: Math.max(0, definition.maxLevel - currentLevel) }, (_, index) => {
    const level = currentLevel + index + 1;
    return { level, cost: getUpgradeCost(definition.baseCost, definition.growth, level - 1) };
  })
);

const buildUpgradeAnalytics = (save: LocalPlayerSave, wallet: ExchangeBalances): EconomyUpgradeAnalytics => {
  let currentLevels = 0; let maximumLevels = 0; let remainingCredits = 0;
  const nextActions: Array<{ label: string; level: number; cost: number }> = [];
  const allSteps: Array<{ label: string; level: number; cost: number }> = [];
  const categories = (Object.keys(UPGRADE_CATEGORY_LABELS) as UpgradeDefinition['category'][]).map((category) => {
    const definitions = UPGRADE_DEFINITIONS.filter((entry) => entry.category === category);
    let categoryCurrent = 0; let categoryMaximum = 0; let categoryRemaining = 0;
    for (const definition of definitions) {
      const current = getUpgradeLevel(save.upgrades, definition.id);
      const steps = remainingUpgradeSteps(definition, current);
      currentLevels += current; maximumLevels += definition.maxLevel;
      categoryCurrent += current; categoryMaximum += definition.maxLevel;
      categoryRemaining += steps.reduce((sum, step) => sum + step.cost, 0);
      allSteps.push(...steps.map((step) => ({ label: definition.label, ...step })));
      if (steps[0]) nextActions.push({ label: definition.label, ...steps[0] });
    }
    remainingCredits += categoryRemaining;
    return {
      id: category, label: UPGRADE_CATEGORY_LABELS[category], currentLevels: categoryCurrent, maximumLevels: categoryMaximum,
      completionPercentage: categoryMaximum ? Math.round(categoryCurrent / categoryMaximum * 1000) / 10 : 100,
      remainingCredits: categoryRemaining
    };
  });
  const nextSorted = [...nextActions].sort((a, b) => a.cost - b.cost);
  const expensiveSorted = [...allSteps].sort((a, b) => b.cost - a.cost);
  return {
    currentLevels, maximumLevels,
    completionPercentage: maximumLevels ? Math.round(currentLevels / maximumLevels * 1000) / 10 : 100,
    remainingCredits,
    affordableActions: nextActions.filter((action) => action.cost <= wallet.credits).length,
    nextUpgrade: nextSorted[0] ?? null,
    mostExpensiveRemaining: expensiveSorted[0] ?? null,
    categories,
    costCurve: allSteps.map((step, index) => ({ label: `${step.label} ${step.level}`, value: step.cost, color: index % 2 ? 0x62efff : 0xff65c8 }))
  };
};

const modRarityBucket = (modId: string): (typeof RARITY_ORDER)[number] => {
  const definition = MOD_BY_ID.get(modId);
  if (definition?.variant === 'corrupted') return 'corrupted';
  return (definition?.rarity ?? 'common') as ModRarity;
};

const buildModAnalytics = (save: LocalPlayerSave, wallet: ExchangeBalances): EconomyModAnalytics => {
  let maxRankCards = 0; let upgradeableCards = 0; let affordableUpgradeActions = 0;
  let remainingCredits = 0; let remainingCoreTokens = 0;
  const buckets = new Map(RARITY_ORDER.map((id) => [id, { cards: 0, remainingCreditEquivalent: 0, affordableActions: 0 }]));
  const costCurve: EconomyValuePoint[] = [];
  for (const card of save.mods.cards) {
    const bucket = buckets.get(modRarityBucket(card.modId))!;
    bucket.cards += 1;
    if (card.upgradeLevel >= MOD_BALANCE.maxRank) { maxRankCards += 1; continue; }
    upgradeableCards += 1;
    const next = getModUpgradeCost(card.modId, (card.upgradeLevel + 1) as 1 | 2 | 3);
    if (next && next.credits <= wallet.credits && next.coreTokens <= wallet.coreTokens) {
      affordableUpgradeActions += 1; bucket.affordableActions += 1;
    }
    for (let rank = card.upgradeLevel + 1; rank <= MOD_BALANCE.maxRank; rank += 1) {
      const cost = getModUpgradeCost(card.modId, rank as 1 | 2 | 3);
      if (!cost) continue;
      remainingCredits += cost.credits; remainingCoreTokens += cost.coreTokens;
      const equivalent = cost.credits + cost.coreTokens * getCreditEquivalentRate('coreTokens');
      bucket.remainingCreditEquivalent += equivalent;
      costCurve.push({ label: `${MOD_BY_ID.get(card.modId)?.name ?? card.modId} R${rank}`, value: equivalent, color: RARITY_COLORS[modRarityBucket(card.modId)] });
    }
  }
  const ownedDefinitions = Object.values(save.mods.inventory).filter((owned) => owned.discovered).length;
  return {
    ownedDefinitions,
    cardCount: save.mods.cards.length,
    maxRankCards, upgradeableCards, affordableUpgradeActions, remainingCredits, remainingCoreTokens,
    remainingCreditEquivalent: remainingCredits + remainingCoreTokens * getCreditEquivalentRate('coreTokens'),
    byRarity: RARITY_ORDER.map((id) => ({ id, label: id.toUpperCase(), ...buckets.get(id)! })),
    costCurve: costCurve.sort((a, b) => a.value - b.value)
  };
};

const buildInfusionAnalytics = (save: LocalPlayerSave): EconomyInfusionAnalytics => {
  const costs = MOD_INFUSIONS.map((infusion) => infusion.plasmaCost);
  const minimumInstallCost = Math.min(...costs);
  const maximumInstallCost = Math.max(...costs);
  const averageInstallCost = Math.round(costs.reduce((sum, value) => sum + value, 0) / Math.max(1, costs.length));
  const plasmaBalance = save.mods.plasmaChips;
  const installedCount = save.mods.cards.filter((card) => Boolean(card.infusionId)).length;
  return {
    plasmaBalance,
    installedCount,
    uninfusedEligibleCards: Math.max(0, save.mods.cards.length - installedCount),
    affordableOptions: MOD_INFUSIONS.filter((infusion) => infusion.plasmaCost <= plasmaBalance).length,
    minimumInstallCost, maximumInstallCost, averageInstallCost,
    minimumCostInstallsAffordable: Math.floor(plasmaBalance / minimumInstallCost),
    averageCostInstallsAffordable: Math.floor(plasmaBalance / averageInstallCost),
    swapsAffordable: Math.floor(plasmaBalance / MOD_BALANCE.infusionReconfigurationPlasmaCost),
    removalsAffordable: Math.floor(plasmaBalance / MOD_BALANCE.infusionRemovalPlasmaCost),
    swapCost: MOD_BALANCE.infusionReconfigurationPlasmaCost,
    removalCost: MOD_BALANCE.infusionRemovalPlasmaCost,
    costs: MOD_INFUSIONS.map((infusion, index) => ({ label: infusion.name, value: infusion.plasmaCost, color: index % 2 ? 0xff65c8 : 0xa671ff }))
  };
};

const classifyReserve = (balance: number, referenceCost: number): string => {
  if (referenceCost <= 0) return balance > 0 ? 'HIGH' : 'LOW';
  const capacity = balance / referenceCost;
  if (capacity < 1) return 'LOW';
  if (capacity < 3) return 'MODERATE';
  if (capacity < 8) return 'HEALTHY';
  return 'HIGH';
};

export const buildEconomyAnalytics = (save: Readonly<LocalPlayerSave>): EconomyAnalyticsSnapshot => {
  const wallet: ExchangeBalances = {
    credits: save.wallet.credits,
    coreTokens: save.wallet.coreTokens,
    plasmaChips: save.mods.plasmaChips,
    fluxCores: save.wallet.fluxCores
  };
  const equivalentByCurrency = (Object.keys(CURRENCY_META) as ExchangeCurrency[]).map((currency) => ({
    currency, ...CURRENCY_META[currency], balance: wallet[currency],
    creditEquivalent: wallet[currency] * getCreditEquivalentRate(currency)
  }));
  const totalPortfolioCreditEquivalent = equivalentByCurrency.reduce((sum, entry) => sum + entry.creditEquivalent, 0);
  const portfolio = equivalentByCurrency.map((entry) => ({
    ...entry,
    percentage: totalPortfolioCreditEquivalent > 0 ? Math.round(entry.creditEquivalent / totalPortfolioCreditEquivalent * 10_000) / 100 : 0
  }));
  const store = buildStoreAnalytics(save as LocalPlayerSave, wallet);
  const upgrades = buildUpgradeAnalytics(save as LocalPlayerSave, wallet);
  const mods = buildModAnalytics(save as LocalPlayerSave, wallet);
  const infusions = buildInfusionAnalytics(save as LocalPlayerSave);
  const finiteProgression: EconomyValuePoint[] = [
    { label: 'PERMANENT UPGRADES', value: upgrades.remainingCredits, color: 0x62efff },
    { label: 'UNOWNED COSMETICS', value: store.remainingCatalogCost.creditEquivalent, color: 0xff65c8 },
    { label: 'OWNED MOD RANKS', value: mods.remainingCreditEquivalent, color: 0xffcc62 }
  ];
  const anomalyMinimumCost = Math.min(...ANOMALY_ENTRY_COSTS);
  const anomalyMaximumCost = Math.max(...ANOMALY_ENTRY_COSTS);
  const positiveCoreCosts = [
    ...COSMETICS.map((item) => getCosmeticPurchaseCosts(item).coreTokens),
    ...save.mods.cards.map((card) => card.upgradeLevel < 3 ? getModUpgradeCost(card.modId, (card.upgradeLevel + 1) as 1 | 2 | 3)?.coreTokens ?? 0 : 0)
  ].filter((value) => value > 0).sort((a, b) => a - b);
  const intel = [
    { label: 'CORE TOKEN RESERVE', value: classifyReserve(wallet.coreTokens, positiveCoreCosts[0] ?? 100), detail: `${wallet.coreTokens.toLocaleString()} CURRENT`, color: 0xffcc62 },
    { label: 'PLASMA RESERVE', value: classifyReserve(wallet.plasmaChips, infusions.minimumInstallCost), detail: `${infusions.minimumCostInstallsAffordable} MIN-COST INFUSIONS`, color: 0xd779ff },
    { label: 'FLUX RESERVE', value: classifyReserve(wallet.fluxCores, anomalyMinimumCost), detail: `${Math.floor(wallet.fluxCores / anomalyMinimumCost)} MIN-COST ENTRIES`, color: 0x72ff9b },
    { label: 'UPGRADE COMPLETION', value: `${upgrades.completionPercentage}%`, detail: `${upgrades.remainingCredits.toLocaleString()} CR REMAINING`, color: 0x65f5ff }
  ];
  return {
    wallet, portfolio, totalPortfolioCreditEquivalent, store, upgrades, mods, infusions, finiteProgression,
    purchasingPower: {
      permanentUpgradeActions: upgrades.affordableActions,
      cosmetics: store.affordableNow,
      modUpgradeActions: mods.affordableUpgradeActions,
      initialInfusionOptions: infusions.affordableOptions,
      infusionSwaps: infusions.swapsAffordable,
      anomalyEntriesAtMinimum: Math.floor(wallet.fluxCores / anomalyMinimumCost),
      anomalyEntriesAtMaximum: Math.floor(wallet.fluxCores / anomalyMaximumCost),
      anomalyMinimumCost, anomalyMaximumCost
    },
    intel,
    ticker: [
      `FLUX CORE // ${getCreditEquivalentRate('fluxCores').toLocaleString()} CR LIQUIDATION`,
      `PLASMA CHIP // ${getCreditEquivalentRate('plasmaChips').toLocaleString()} CR LIQUIDATION`,
      `UNOWNED COSMETICS // ${Math.max(0, store.total - store.owned)}`,
      `REMAINING UPGRADE COST // ${upgrades.remainingCredits.toLocaleString()} CR`,
      `INFUSION INSTALL // ${infusions.minimumInstallCost}-${infusions.maximumInstallCost} PC`,
      `MOD UPGRADES AFFORDABLE // ${mods.affordableUpgradeActions}`,
      `EXCHANGE ROUTES // ${CURRENCY_EXCHANGE_RATES.length} FIXED PAIRS`
    ]
  };
};
