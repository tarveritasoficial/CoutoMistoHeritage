# Couto Misto Heritage

A 2D top-down fortress-defense game built with HTML5 Canvas, CSS and vanilla JavaScript. Designed for GitHub Pages; no backend or build step is required.

## Play

https://tarveritasoficial.github.io/CoutoMistoHeritage/

## Controls

- **WASD / Arrow keys:** move
- **Mouse:** aim
- **Left mouse button:** fire musket
- **Space:** sword attack
- **R:** reload
- **Esc:** pause
- **Mobile:** left virtual joystick; FIRE, SWORD and RELOAD touch controls

## Current playable prototype

- Star-shaped five-bastion fortress with destructible walls, gates and bastions
- Large open countryside: leave through the gates (open to you and your guard) and fight outside
- Four fortified enemy camps (France, Spain, Portugal, England) with garrisons; destroy them with sword or musket. Each camp lost means smaller waves, and destroying all four wins the game
- Minimap and camp counter
- Couto Misto player soldier with musket and sword
- Eight elite royal guards defending fixed positions
- Four invading factions: Portugal, Spain, France and England
- Progressive enemy waves, score, health, ammunition and fortress condition
- Riflemen, swordsmen, cavalry and elephant units
- Villagers, flags, defensive cannon emplacements and combat effects
- Responsive desktop and mobile interface

## Project files

- `index.html` — game page and interface
- `styles.css` — responsive historical military UI
- `game.js` — Canvas rendering, player, AI, combat and waves
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

## Deploy

Every push to `main` triggers the Pages workflow. In repository settings, set **Settings → Pages → Build and deployment → Source** to **Deploy from a branch**, choose **gh-pages** and **/(root)**, then save.

Historical note: this is a fictionalized, historically inspired game setting, not a documentary reconstruction of a specific battle.
