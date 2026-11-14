// The on-screen controls: where to go, what is happening, how to move, and the map data
// credits. Plain DOM.

/** Walking on foot, or the fly-around free view. */
export type ViewChoice = "walk" | "free";

const VIEW_TEXT: Record<ViewChoice, { button: string; hint: string }> = {
  walk: {
    button: "Free view (F)",
    hint: "Click the view to look around. W A S D to walk, Shift to run, Space to jump. Esc lets go of the mouse.",
  },
  free: {
    button: "Walk (F)",
    hint: "Drag to move, right-drag to turn, scroll to zoom.",
  },
};
/** The key that switches between walking and the free view. */
const VIEW_KEY = "KeyF";

export type Panel = {
  /** Called with the text in the box when the player presses Go (or Enter). */
  onGo(handler: (text: string) => void): void;
  setText(text: string): void;
  setStatus(message: string, kind?: "info" | "error"): void;
  setBusy(busy: boolean): void;
  /** Called when the player asks to switch view, with the button or the F key. */
  onToggleView(handler: () => void): void;
  /** Shows which view is on: the button offers the other one, the hint explains this one. */
  setView(view: ViewChoice): void;
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
    <p class="hint"></p>
    <button type="button" class="view-toggle"></button>
  `;
  const credit = document.createElement("div");
  credit.className = "map-credit";
  // Both map data sources are credited (docs/11-legal-and-privacy.md).
  credit.innerHTML =
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, ' +
    '<a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps Foundation</a>';
  parent.append(form, credit);

  const input = form.querySelector("input");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector(".status");
  const hint = form.querySelector(".hint");
  const toggle = form.querySelector<HTMLButtonElement>(".view-toggle");
  if (!input || !button || !status || !hint || !toggle) {
    throw new Error("panel markup is missing a part");
  }

  return {
    onGo(handler) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        // Leave the text box, so the keys walk instead of typing.
        input.blur();
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
    onToggleView(handler) {
      toggle.addEventListener("click", () => {
        // Let go of the button, so Space jumps instead of pressing it again.
        toggle.blur();
        handler();
      });
      window.addEventListener("keydown", (event) => {
        if (event.code !== VIEW_KEY || event.repeat || event.target === input) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        handler();
      });
    },
    setView(view) {
      toggle.textContent = VIEW_TEXT[view].button;
      hint.textContent = VIEW_TEXT[view].hint;
    },
  };
}
