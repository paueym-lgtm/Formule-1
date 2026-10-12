Original prompt: Ajouter Interlagos avec tracé, relief et stands, remplacer la caméra d'accueil par un sas automobile moderne avec Grand Prix / Autres circuits. Ajouter ensuite tous les circuits manquants de la liste de 23 Grands Prix, dans l'ordre exact fourni. Conserver Sepang dans Autres circuits.

## Implementation
- Preserve original game engine and all existing tracks.
- Import community geospatial track lines with attribution.
- Use independently mapped pit paths where available; expose simulation fidelity honestly.
- Ordered catalog of 23 selectable Grands Prix and Sepang separately.
- Static automotive garage entrance, circuit selection, driver setup, room, race.

## QA inventory
- Desktop and mobile entrance, both categories, all 23 entries in supplied order.
- Every new circuit builds finite geometry, relief, and complete pit entry/service/exit path.
- Circuit selection syncs to room; remote config can switch category without hiding track.
- Solo driver -> room -> countdown -> accelerate / brake / steer / camera / reset.
- Return to categories and switch Grand Prix / Sepang / Grand Prix.
- Mood, sound, laps, bots, bot level and profile color/number.
- Off-happy paths: selecting while a guest, category changes after room leave, WebGL loading failure.
- Visual inspection of Interlagos track and pits, hill circuits, tight street circuits.
- Existing multiplayer server retained; live multi-device networking not claimed verified.

## Completed checks
- 23 GP entries match the user-provided order exactly; each card and circuit is selectable, none is a placeholder.
- All 24 circuits build finite track / elevation / racing line / pit data.
- All 15 new Three.js environments build with finite mesh coordinates and no page errors.
- Pit approach -> garage service -> exit simulation succeeds on all 15 additions.
- 12 additions use independent mapped OpenStreetMap pit centerlines. Australia, China and Zandvoort use reconstructed pit routes.
- Real-input solo race at Interlagos, countdown, acceleration, steering, braking, three cameras and reset exercised.
- GP -> Sepang -> GP, search / no results / restored results, sources modal / Escape, laps, bots, difficulty, mood, sound, driver number and color exercised.
- Desktop 1440x900 and mobile 390x844 entrance/catalog/screenshots inspected; no horizontal overflow. Mobile selected circuit now scrolls its detail back into view.
- Provided web_game_playwright_client.js completed without error logs; screenshots inspected.

## Known fidelity / verification limits
- No continuous survey-grade elevation data. Heights are interpolated published anchors; Saudi Arabia, Miami, Las Vegas and Qatar have non-measured simplified profiles.
- Track width remains uniform and real banking is not implemented.
- Existing Singapore historical 23-turn configuration intentionally retained.
- Pit horizontal mapping does not certify exact elevation, width, safety barriers, garage footprints or every transition.
- Multiplayer source transport retained, not tested against two live external clients.
- Software WebGL in the QA sandbox is slow (roughly 1 fps during full driving); no claim of device-independent frame rate is made.
- Preview hosting disallows browser persistence / full-screen APIs. Preferences are per-tab in memory; unavailable full-screen controls are hidden.
