import "./style.css";
import { WORLD_VERSION } from "@somewhere/world";

console.log("world package", WORLD_VERSION);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <h1 style="padding:16px">Somewhere</h1>
  <div class="osm-credit">© OpenStreetMap contributors</div>
`;
