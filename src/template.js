export function createAppLayout(engineDifficulty) {
  const difficultyOptions = Array.from({ length: 10 }, (_, index) => {
    const level = index + 1;
    return `<option value="${level}">Level ${level}</option>`;
  }).join("");

  return `
    <main class="mx-auto grid w-full max-w-7xl gap-6 p-3 md:grid-cols-[auto_360px] md:p-8">
      <section class="panel-shell rounded-3xl border p-4 shadow-2xl md:p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 class="font-title text-3xl leading-tight">Vite Chess Arena</h1>
            <p class="mt-1 font-body text-sm opacity-85">Play local, vs engine, or online session multiplayer.</p>
          </div>
          <span id="mode-chip" class="badge-chip">Local</span>
        </div>

        <div class="board-area rounded-2xl p-3">
          <div class="board-wrap">
            <div id="rank-labels" class="rank-labels" aria-hidden="true"></div>
            <div>
              <div id="board" class="chess-board" aria-label="Chess board"></div>
              <div id="file-labels" class="file-labels" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </section>

      <aside class="panel-shell rounded-3xl border p-4 shadow-2xl md:p-5">
        <h2 class="font-title text-2xl">Control Panel</h2>
        <p id="status" class="mt-2 min-h-16 font-body text-sm"></p>
        <p id="notice" class="min-h-6 font-body text-xs text-emerald-800"></p>

        <label class="mt-2 block font-body text-sm" for="mode-select">Mode</label>
        <select id="mode-select" class="mt-1 w-full rounded-xl border px-3 py-2 font-body text-sm">
          <option value="local">Local 2 Player</option>
          <option value="engine">Play vs Engine</option>
          <option value="online">Online Session</option>
        </select>

        <section id="engine-controls" class="mt-3 rounded-xl border p-3 hidden">
          <h3 class="font-title text-base">Engine Settings</h3>
          <label class="mt-2 block font-body text-sm" for="engine-difficulty">Difficulty</label>
          <select id="engine-difficulty" class="mt-1 w-full rounded-lg border px-3 py-2 font-body text-sm">
            ${difficultyOptions}
          </select>
          <p class="mt-2 font-body text-xs">Selected level: <span id="engine-level-value">${engineDifficulty}</span> / 10</p>
        </section>

        <label class="mt-2 block font-body text-sm" for="theme-select">Theme</label>
        <select id="theme-select" class="mt-1 w-full rounded-xl border px-3 py-2 font-body text-sm"></select>

        <section id="online-controls" class="mt-3 rounded-xl border p-3 hidden">
          <h3 class="font-title text-base">Session Multiplayer</h3>
          <div class="mt-2 flex gap-2">
            <button id="create-session" class="rounded-full px-3 py-1.5 font-body text-xs font-semibold text-white">Create Session</button>
            <button id="join-session" class="rounded-full px-3 py-1.5 font-body text-xs font-semibold text-white">Join</button>
          </div>
          <input id="session-input" class="mt-2 w-full rounded-lg border px-3 py-2 font-body text-sm uppercase" placeholder="Enter session code" maxlength="6" />
          <p id="session-meta" class="mt-2 font-body text-xs"></p>
        </section>

        <div class="mb-4 mt-3 flex gap-2">
          <button id="new-game" class="rounded-full px-4 py-2 font-body text-sm font-semibold text-white transition">New Game</button>
        </div>

        <h3 class="font-title text-lg">Moves Notation</h3>
        <ol id="move-list" class="mt-2 max-h-[350px] list-decimal overflow-auto pl-5 font-body text-sm"></ol>
      </aside>
    </main>

    <div id="promotion-modal" class="promo-overlay hidden" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
      <div class="promo-card">
        <h4 class="font-title text-xl">Choose Promotion</h4>
        <div id="promo-choices" class="promo-choices"></div>
      </div>
    </div>

    <div id="game-end-modal" class="end-overlay hidden" role="dialog" aria-modal="true" aria-label="Game over">
      <div class="end-card">
        <h4 class="font-title text-2xl">Game Over</h4>
        <p id="end-message" class="mt-2 font-body text-sm"></p>
        <button id="restart-game" class="mt-4 rounded-full px-4 py-2 font-body text-sm font-semibold text-white">Restart Game</button>
      </div>
    </div>
  `;
}
