# TikTok LIVE game reference study

Reviewed the developer pages and gameplay images on 2026-11-17. The focus is audience-controlled TikTok LIVE games, rather than ordinary mobile survival games.

| Reference                                                                    | Observation                                                                                                                                    | Applied to Survival Arena                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Hold the Line — ScrollPlay](https://scrollplay.live/playpass/hold-the-line) | An automatic defense, one dominant objective and named viewer events make the audience’s influence visible inside the action.                  | Automatic crystal defense, health as the main success measure, short named gift acknowledgements, a sender-named boss.               |
| [Tower Siege — TT Interactive](https://wgmojo.gg/arcade/games/tower-siege/)  | Practice controls are separate from a clean broadcast overlay. Gifts can help the defense or introduce a threat. Rounds restart automatically. | Separate `/admin.html`, a full-screen audience view, heal/freeze/meteor help versus a crown boss, automatic progression and restart. |
| [King of the Hill — EarnOnLIVE](https://earnonlive.com/games/koth)           | Each audience event creates an obvious disruption or recovery around one understandable goal.                                                  | Four simple interactions with distinct colors, large fire/ice/lightning reactions and visible crystal damage.                        |

The interpretation is deliberately simple: **monsters attack the crystal; viewers help or summon a boss**. No landing page, sidebar, scoreboard, timer, chapter names or upgrade menu interrupts the viewer. The target is an understandable objective within two seconds after loading; this is a design target, not a claim of completed user testing.

The arena canvas fills the viewport in portrait and landscape. Wave and health sit over the top; compact simulated interaction controls sit at the bottom. Everything else lives in the separate broadcaster page. Effects provide visual cause and effect without requiring sound.

The references informed interaction patterns and hierarchy. Their characters, screenshots, branding and art assets were not reused. All shipped game artwork remains original.
