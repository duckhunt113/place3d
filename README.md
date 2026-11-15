# Somewhere

A browser game that rebuilds a real place as a bright, stylized 3D world you can walk around in.
Type in coordinates and the streets, houses, shops and trees around that point appear, built
from open map data.

**Status:** the MVP (v0.1) is built. It is made for one area so far: Albertson Crescent and
the Lorne Park plaza in Mississauga, Ontario.

## Run it

You need Node.js 22.6 or newer and pnpm.

```
pnpm install
pnpm dev
```

Open the address it prints. You start on Albertson Crescent.

- Click the view to capture the mouse. W A S D to walk, Shift to run, Space to jump.
- Press F (or the button) for the free view, which flies above the area.
- Type other coordinates, or paste a map link, and press Go. Places outside the saved area
  are fetched from the public OpenStreetMap server, which can be slow, and are then kept on
  your device.

## Check it

```
pnpm fix
pnpm lint && pnpm palette:check && pnpm typecheck && pnpm test
```

## Where things are

- `apps/web`: the game in the browser (drawing, physics, player, loading).
- `packages/world`: turns map data into a world. Plain TypeScript with no drawing or physics
  in it, so it also runs in tests and scripts.
- `docs/`: how it works and why, starting at [docs/README.md](docs/README.md).
- [CLAUDE.md](CLAUDE.md): the project's rules and conventions.

## Map data

© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, and building
outlines from the [Overture Maps Foundation](https://overturemaps.org). No Google Maps or
Street View data is used.
