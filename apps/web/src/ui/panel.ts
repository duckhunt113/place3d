// The on-screen controls: where to go, what is happening, and the map credit. Plain DOM.

export type Panel = {
  /** Called with the text in the box when the player presses Go (or Enter). */
  onGo(handler: (text: string) => void): void;
  setText(text: string): void;
  setStatus(message: string, kind?: "info" | "error"): void;
  setBusy(busy: boolean): void;
};

export function createPanel(parent: HTMLElement): Panel {
  const form = document.createElement("form");
  form.className = "panel";
  form.innerHTML = `
    <label for="where">Where to?</label>
    <div class="row">
      <input id="where" name="where" type="text" autocomplete="off" spellcheck="false"
        placeholder="43.5245, -79.6190 or a map link" />
      <button type="submit">Go</button>
    </div>
    <p class="status" role="status"></p>
    <p class="hint">Drag to move, right-drag to turn, scroll to zoom.</p>
  `;
  const credit = document.createElement("div");
  credit.className = "osm-credit";
  credit.innerHTML =
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  parent.append(form, credit);

  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const status = form.querySelector(".status");
  if (!input || !button || !status) throw new Error("panel markup is missing a part");

  return {
    onGo(handler) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handler(input.value);
      });
    },
    setText(text) {
      input.value = text;
    },
    setStatus(message, kind = "info") {
      status.textContent = message;
      status.classList.toggle("error", kind === "error");
    },
    setBusy(busy) {
      button.disabled = busy;
    },
  };
}
