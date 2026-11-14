# 13 — References

## Similar projects (try them with your own address)

- World Explorer 3D: https://worldexplorer3d.io (browser multiplayer sandbox on real geography)
- OpenWorld3D: https://openworld3d.com (OSM city in 3D, walk into buildings, drive)
- Hop.Earth: https://hop.earth (drive any OSM road; multiplayer races)
- Arnis: https://github.com/louis-e/arnis (OSM to Minecraft); Map2Minecraft: https://map2minecraft.com
- Google Project Genie with Street View (AI world model; US-only; reference only, not a data source)

## Repos worth studying

- Arnis (Rust): how OSM elements turn into a 3D world, element by element. https://github.com/louis-e/arnis
- Streets GL (TypeScript, MIT): OSM 3D renderer; building and roof geometry. https://github.com/StrandedKitty/streets-gl
- OSM2World: thorough OSM tag to 3D model conversion. https://osm2world.org
- Hop (Hop.Earth's published stack): tile services + Socket.IO multiplayer. https://github.com/DVLPLONDON/Hop

## Three.js examples

- Official FPS example (first-person controls + octree collisions): https://threejs.org/examples/?q=fps#games_fps
- Krunker.io: multiplayer FPS built on Three.js. https://krunker.io
- Bruno Simon's portfolio: stylized physics playground. https://bruno-simon.com

## Docs

- OSM wiki, Map features: https://wiki.openstreetmap.org/wiki/Map_features
- OSM wiki, Simple 3D Buildings: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings
- OSM wiki, Overpass API (instances and usage policy): https://wiki.openstreetmap.org/wiki/Overpass_API
- Overpass Turbo (test queries): https://overpass-turbo.eu
- Geofabrik downloads: https://download.geofabrik.de
- Mapillary: https://www.mapillary.com
- Three.js docs: https://threejs.org/docs
- Rapier (JS): https://rapier.rs
- Colyseus: https://colyseus.io
- Vite: https://vite.dev
- pnpm workspaces: https://pnpm.io/workspaces

## Checking OSM data for an area

openstreetmap.org → zoom in → "Query features" tool (cursor with a question mark) → click anything to see its tags.

## Agent skills and plugins (optional; read each SKILL.md before installing)

- Three.js: `pnpm dlx skills add https://github.com/secondsky/claude-skills --skill threejs` (alternative: `mengto/skills` → threejs)
- Frontend design: `pnpm dlx skills add anthropics/skills --skill frontend-design`
- Blender procedural kit pieces: `pnpm dlx claudepluginhub arjun988/blender-skills --plugin blender-skills`
- Claude plugins: **parallax-threejs** (Three.js debugging + visual regression), **Render** (hosting, later)
- Project skills live in `.claude/skills/`:
  1. art style guide: done (`.claude/skills/art-style/`)
  2. repo audit: done (`.claude/skills/repo-audit/`)
  3. OSM tag rules: to write
  4. project conventions: to write
