/** Authored VO and its exact default-control transcript. Subtitles derive from this source. */
export const LYRA_TUTORIAL_SCRIPT: Record<string, { file: string; text: string; controls?: Record<string, string> }> = {
  'onboarding.menu-welcome.welcome': {
    file: 'lyrawelcome.mp3',
    text: 'Welcome, Operative. I am LYRA — your Tactical Systems Intelligence Assistant. TSIA, if brevity becomes necessary. It usually does.\n\nBeginning RWG-recommended training and systems calibration.\n\nWe’ll start with movement, then proceed to arming and defending a planted charge.\n\nI’ll remain on comms. You handle the shooting. I find our arrangement considerably safer that way.'
  },
  'onboarding.menu-welcome.advanced-preview': {
    file: 'lyrasupremepreview.mp3',
    text: 'Operative... this is a preview of Supreme Operations.\n\nThis is where your training eventually leads. The arena is considerably less forgiving by then.\n\nTry to keep up.\n\nDon’t worry. We’ll begin somewhere significantly less suicidal.'
  },
  'onboarding.menu-welcome.start-local': {
    file: 'lyrastartlocal.mp3',
    text: 'Begin your first training run here.\n\nSTART LOCAL launches standard play without publishing your score to the online leaderboards.\n\nSelect START LOCAL when you’re ready, Operative.'
  },
  'onboarding.menu-resume-training.start-local': {
    file: 'lyrareturntotraining.mp3',
    text: 'Arena training is still in progress.\n\nSelect START LOCAL to resume your training deployment. I kept everything exactly where you left it. Mostly.'
  },
  'onboarding.basic-controls.welcome': {
    file: 'lyraenteringarena.mp3',
    text: 'LYRA online.\n\nThis is a live deployment exercise. We’ll begin with movement and weapons calibration.\n\nContinue when you’re ready, Operative.'
  },
  'onboarding.basic-controls.move': {
    file: 'lyramovement.mp3', controls: { '{MOVE}': 'W, A, S, and D' },
    text: 'Use W, A, S, and D to move.\n\nA stationary operative makes an exceptionally convenient target. The security systems appreciate your cooperation.'
  },
  'onboarding.basic-controls.aim': {
    file: 'lyraaiming.mp3', controls: { '{AIM}': 'MOUSE' },
    text: 'Neural link established. Motor control appears functional.\n\n...Encouraging.\n\nUse the MOUSE to aim toward your reticle. Movement and targeting operate independently.'
  },
  'onboarding.basic-controls.fire': {
    file: 'lyrafiring.mp3', controls: { '{FIRE}': 'LEFT MOUSE BUTTON' },
    text: 'Targeting link confirmed.\n\nPress LEFT MOUSE BUTTON to fire.\n\nRemember: your weapon consumes energy, Operative. Accuracy is considerably cheaper than panic.'
  },
  'onboarding.hud.vitals': {
    file: 'lyrahealthenergy.mp3',
    text: 'Weapons confirmed.\n\nRed represents Health. Cyan represents Energy.\n\nCollect the corresponding pickups when either becomes depleted. I strongly recommend maintaining both.'
  },
  'onboarding.defense.bombsite': {
    file: 'lyraplantingcharge.mp3', controls: { 'hold {INTERACT}': 'hold E' },
    text: 'Move into the available bombsite and hold E to plant the charge.\n\nOnce armed, defend it until detonation.\n\nAnd when the timer reaches zero, I recommend being somewhere else. The cleanup drones have already filed several complaints.'
  },
  'onboarding.defense.enemy': {
    file: 'lyrafirstcombatdefusers.mp3',
    text: 'Charge armed.\n\nEngage a hostile and confirm weapons contact.\n\nEnemies may attempt to disarm the device. Stop them before they succeed, then defend the charge until detonation.'
  },
  'onboarding.tactics.shield': {
    file: 'lyrashield.mp3', controls: { '{SHIELD}': 'MIDDLE MOUSE BUTTON' },
    text: 'Operative, let’s improve your chances of surviving this.\n\nPress MIDDLE MOUSE BUTTON to activate your SHIELD.\n\nShielding consumes energy and requires time to recharge before it can be activated again.\n\nUse it deliberately. These operative frames are not what RWG would describe as... disposable.'
  },
  'onboarding.tactics.dash': {
    file: 'lyradash.mp3', controls: { '{DASH}': 'SPACE BAR' },
    text: 'RWG has provided several additional methods of keeping you alive, including the DASH system.\n\nPress SPACE BAR to surge toward your current aim direction.\n\nDashing — as you may have suspected — consumes energy and has a cooldown.\n\nYour survival will depend heavily on managing Health, Energy, movement, and timing. Preferably all four simultaneously.'
  },
  'onboarding.tactics.mine': {
    file: 'lyramines.mp3', controls: { 'press {MINE}': 'press R' },
    text: 'The highlighted HUD module represents your MINE RACK.\n\nMine rack online. Charges are limited, so placement matters.\n\nAim at a valid location and press R to deploy a mine.\n\nRWG reminds all operatives that it accepts no liability for improper placement, accidental detonation, personal injury, or death.\n\nA remarkably comprehensive waiver.'
  },
  'onboarding.tactics.fence': {
    file: 'lyraelectricfences.mp3', controls: { 'Press {FENCE}': 'Press Q' },
    text: 'Press Q to deploy an electric fence.\n\nFences can slow enemies and temporarily restrict their movement.\n\nR&D also recommends firing through active fences. Their report describes the resulting effect as, quote, “wondrous.”\n\nI requested a more technical explanation. None was provided. Use your discretion, Operative.'
  },
  'onboarding.tactics.turret': {
    file: 'lyraturrets.mp3', controls: { 'Press {TURRET}': 'Press F' },
    text: 'Press F to deploy RWG’s latest personal-security platform: an automated turret.\n\nTurrets can defend territory while you attend to other threats.\n\nConsider them temporary arena partners. Being everywhere at once is difficult.\n\nThey seem less troubled by the limitation.'
  },
  'onboarding.certification.release': {
    file: 'lyratrainingcomplete.mp3',
    text: 'Systems calibrated.\n\nMonitor the readiness and cooldown state of your defensive modules during combat.\n\nRWG Training Manual, Entry 47-A — Mobility and Survival — recommends remaining mobile, managing your resources, and collecting available pickups whenever conditions allow.\n\nFor once, the manual is correct.\n\nTraining calibration complete.\n\nGood luck, Operative.\n\nLYRA standing by.'
  }
};

export function lyraTutorialText(id: string): string {
  const line = LYRA_TUTORIAL_SCRIPT[id];
  if (!line) throw new Error(`Missing LYRA tutorial script: ${id}`);
  return Object.entries(line.controls ?? {}).reduce((text, [token, spoken]) => text.replaceAll(spoken, token), line.text);
}
