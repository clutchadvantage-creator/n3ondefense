# Tug Life steam whistle and Access Card purchase feedback

Access Card purchases show an `ACCESS SECURED` receipt with the purchased card, Credits spent, and updated inventory. The purchased card receives a gold highlight and sheen, accompanied by the existing reward cue. Failed transactions show the failure message and locked cue. Daily limits, prices, and portal selection rules are unchanged. Reduced-motion settings retain the receipt without its animations.

`bomb-tug-life` adds **Tug Life // Full Steam** to Bombsite Explosions. Its prestige price is 20,000 Credits, 400 Core Tokens, and 90 Plasma Chips. The Store uses animated SVG; the Garage and arena use textures loaded from the same vector whistle artwork. The brass whistle extends as pressure builds, then releases expanding white steam. `tuglifebombexplosion.mp3` starts at the 520 ms release point through the normal SFX mixer, with its own Tug Life Steam Whistle volume channel.

The 3.4-second arena effect uses one whistle and fourteen reusable steam sprites per active effect (eight steam sprites at reduced detail). Existing limits of six active effects, or four with particles disabled, remain in place. Delayed audio follows the scene clock and encounter cleanup. Cosmetic presentation does not alter blast damage or radius.

Validation: all 818 automated tests and the production build passed. Isolated browser checks covered successful purchases, failed purchases without a debit or success animation, the third daily purchase, cosmetic purchase/equipment, SVG texture loading, and MP3 decoding. Actual arena detonation dispatched the whistle cue at 533.4 ms (the first frame after 520 ms), rendered steam, and cleared the effect at expiry. Store and arena previews were visually inspected.
