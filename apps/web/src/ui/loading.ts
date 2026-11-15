// The loading card: shown over the view while an area is fetched and built, with a bar that
// fills tile by tile. Plain DOM.

export type Loading = {
  /** Shows the card: `done` of `total` tiles are ready. */
  show(done: number, total: number): void;
  hide(): void;
};

export function createLoading(parent: HTMLElement): Loading {
  const card = document.createElement("div");
  card.className = "loading";
  card.hidden = true;
  card.setAttribute("role", "status");
  card.innerHTML = `
    <p class="title">Building the map</p>
    <progress max="1" value="0"></progress>
    <p class="count"></p>
  `;
  parent.append(card);
  const bar = card.querySelector("progress");
  const count = card.querySelector(".count");
  if (!bar || !count) throw new Error("loading markup is missing a part");

  return {
    show(done, total) {
      card.hidden = false;
      bar.max = Math.max(1, total);
      bar.value = Math.min(done, total);
      count.textContent = total > 0 ? `${done} of ${total} tiles` : "Finding the place...";
    },
    hide() {
      card.hidden = true;
    },
  };
}
