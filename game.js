(() => {
  "use strict";

  // ---------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------
  const TILE = 48, COLS = 12, ROWS = 8;
  const SUPABASE_URL = "https://gluoioiimapyhchdasfl.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdW9pb2lpbWFweWhjaGRhc2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDQ3MjAsImV4cCI6MjA5NTYyMDcyMH0.dHVB0jJBMjUunJKSsqbaM3MGCAq-ZRSWQEqvEyUjIyk";
  const SAVE_KEY = "kristal-ajaib-save-v1";

  // ---------------------------------------------------------------
  // Areas: terrain grids (# = wall, . = floor)
  // ---------------------------------------------------------------
  const AREAS = {
    village: {
      name: "Desa Damai", bg: "#5fb84e", floor: "#7ec850", wall: "#3d7a30", wallEmoji: "🌳",
      grid: [
        "############",
        "#..........#",
        "#..#....#..#",
        "#..........#",
        "#....##....#",
        "#..........#",
        "#..........#",
        "#####.######",
      ],
      npcs: [
        { id: "kek_tua", x: 3, y: 3, emoji: "🧓", name: "Kek Tua",
          getLines(s) {
            if (!s.flags.metKekTua) return [
              "Cucuku... desa kita kehilangan 3 Kristal Ajaib!",
              "Tanpa kristal itu, cahaya desa akan padam selamanya.",
              "Carilah ke hutan, gua, dan puncak gunung. Semoga berhasil!",
            ];
            return ["Semangat terus, cucuku! Desa mengandalkanmu."];
          },
          onComplete(s) { s.flags.metKekTua = true; } },
        { id: "blacksmith", x: 8, y: 3, emoji: "👩‍🏭", name: "Bibi Api",
          getLines(s) {
            if (!s.inventory.has("torch")) return [
              "Gua itu gelap sekali, kamu butuh obor!",
              "Ini, bawalah obor buatanku. Hati-hati di jalan!",
            ];
            return ["Obornya masih menyala terang kan? Bagus!"];
          },
          onComplete(s) { if (!s.inventory.has("torch")) { s.inventory.add("torch"); playTone(660, 0.12); showToast("🔥 Kamu mendapat Obor!"); } } },
      ],
      items: [],
      transitions: [{ x: 5, y: 7, to: "forest", spawn: { x: 5, y: 1 } }],
      puzzle: null,
    },

    forest: {
      name: "Hutan Bisikan", bg: "#2e6b3e", floor: "#3f8a4f", wall: "#1c3f24", wallEmoji: "🌲",
      grid: [
        "#####.######",
        "#..........#",
        "#.##....##.#",
        "#..........#",
        "#....##.....",
        "#.##....##.#",
        "#..........#",
        "############",
      ],
      npcs: [
        { id: "peri", x: 2, y: 3, emoji: "🧚", name: "Peri Hutan",
          getLines(s) {
            if (!s.inventory.has("crystal1")) return [
              "Psst! Ada kristal bersinar di dekat pohon tua sebelah timur.",
            ];
            if (!s.inventory.has("torch")) return ["Kamu butuh obor dari Bibi Api untuk masuk gua di timur."];
            return ["Kristal kedua menantimu di dalam gua. Berani masuk?"];
          },
          onComplete() {} },
      ],
      items: [{ id: "crystal1", x: 6, y: 2, emoji: "💎", label: "Kristal Ajaib #1" }],
      transitions: [
        { x: 5, y: 0, to: "village", spawn: { x: 5, y: 6 } },
        { x: 11, y: 4, to: "cave", spawn: { x: 1, y: 4 }, requires: (s) => s.inventory.has("torch"), blockedMsg: "Gelap sekali! Aku butuh obor untuk masuk." },
      ],
      puzzle: null,
    },

    cave: {
      name: "Gua Kunang-Kunang", bg: "#241531", floor: "#382048", wall: "#150c1e", wallEmoji: "🪨",
      grid: [
        "#####.######",
        "#..........#",
        "#..####..#.#",
        "#..#....#..#",
        "...........#",
        "#..#....#..#",
        "#..........#",
        "############",
      ],
      npcs: [
        { id: "hermit", x: 9, y: 3, emoji: "🧙", name: "Kakek Gua",
          getLines(s) {
            if (!s.inventory.has("crystal1")) return ["Kembalilah setelah kau temukan kristal pertama di hutan."];
            if (!s.inventory.has("crystal2")) return ["Kristal kedua bersembunyi di sudut gua yang gelap. Cari dengan teliti!"];
            if (!s.inventory.has("key")) return [
              "Hebat sekali kau menemukannya!",
              "Ambillah Kunci Emas ini untuk membuka jalan ke puncak gunung.",
            ];
            return ["Naga penjaga di puncak menantimu. Semoga beruntung!"];
          },
          onComplete(s) {
            if (s.inventory.has("crystal2") && !s.inventory.has("key")) {
              s.inventory.add("key"); playTone(660, 0.12); showToast("🗝️ Kamu mendapat Kunci Emas!");
            }
          } },
      ],
      items: [{ id: "crystal2", x: 2, y: 6, emoji: "💎", label: "Kristal Ajaib #2" }],
      transitions: [
        { x: 0, y: 4, to: "forest", spawn: { x: 10, y: 4 } },
        { x: 5, y: 0, to: "mountain", spawn: { x: 5, y: 6 }, requires: (s) => s.inventory.has("key"), blockedMsg: "Jalan ke atas terkunci. Aku butuh kunci." },
      ],
      puzzle: null,
    },

    mountain: {
      name: "Puncak Awan", bg: "#a9d3e8", floor: "#cdeaf7", wall: "#7fb0c9", wallEmoji: "🏔️",
      grid: [
        "############",
        "#..........#",
        "#....##....#",
        "#..........#",
        "#..........#",
        "#..........#",
        "#..........#",
        "#####.######",
      ],
      npcs: [
        { id: "naga", x: 6, y: 6, emoji: "🐉", name: "Naga Penjaga",
          getLines(s) {
            if (s.crystalCount < 3) return ["Kembalilah setelah kau kumpulkan ketiga Kristal Ajaib!"];
            return ["Luar biasa! Kau berhasil menyelamatkan desa kita!"];
          },
          onComplete(s) { if (s.crystalCount >= 3) window.__endGame(); } },
      ],
      items: [],
      transitions: [{ x: 5, y: 7, to: "cave", spawn: { x: 5, y: 1 } }],
      puzzle: { x: 5, y: 4, flag: "puzzleSolved" },
    },
  };

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const state = {
    playerName: "", area: "village", gx: 5, gy: 4, px: 0, py: 0, dir: "down", moving: false,
    inventory: new Set(), crystalCount: 0, flags: {}, startTime: 0, muted: false,
  };

  function collectedItems(areaKey) {
    return state.flags["items_" + areaKey] || (state.flags["items_" + areaKey] = new Set());
  }

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const startScreen = $("start-screen"), gameScreen = $("game-screen"), endScreen = $("end-screen");
  const canvas = $("game-canvas"), ctx = canvas.getContext("2d");
  const dlgBox = $("dialogue"), dlgName = $("dlg-name"), dlgText = $("dlg-text");
  const toastEl = $("toast");
  const areaNameEl = $("area-name"), crystalCountEl = $("crystal-count"), timerEl = $("timer");
  const puzzleOverlay = $("puzzle-overlay"), puzzleStatus = $("puzzle-status");

  // ---------------------------------------------------------------
  // Sound
  // ---------------------------------------------------------------
  let actx = null;
  function playTone(freq, dur) {
    if (state.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.15, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* audio unsupported, ignore */ }
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ---------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------
  let dlgQueue = [], dlgOnDone = null;
  function openDialogue(name, lines, onDone) {
    dlgQueue = lines.slice();
    dlgOnDone = onDone || null;
    dlgName.textContent = name;
    dlgBox.classList.remove("hidden");
    advanceDialogue();
  }
  function advanceDialogue() {
    if (dlgQueue.length === 0) {
      dlgBox.classList.add("hidden");
      if (dlgOnDone) { const fn = dlgOnDone; dlgOnDone = null; fn(); }
      return;
    }
    dlgText.textContent = dlgQueue.shift();
    playTone(440, 0.05);
  }
  dlgBox.addEventListener("click", advanceDialogue);

  // ---------------------------------------------------------------
  // Grid helpers
  // ---------------------------------------------------------------
  function isBlocked(areaKey, x, y) {
    const area = AREAS[areaKey];
    if (x < 0 || y < 0 || y >= area.grid.length || x >= area.grid[0].length) return true;
    if (area.grid[y][x] === "#") return true;
    if (area.npcs.some((n) => n.x === x && n.y === y)) return true;
    return false;
  }

  function facingCoords() {
    let { gx, gy, dir } = state;
    if (dir === "up") gy -= 1; else if (dir === "down") gy += 1;
    else if (dir === "left") gx -= 1; else if (dir === "right") gx += 1;
    return { x: gx, y: gy };
  }

  // ---------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------
  function tryMove(dir) {
    if (state.moving || !dlgBox.classList.contains("hidden") || !puzzleOverlay.classList.contains("hidden")) return;
    state.dir = dir;
    let nx = state.gx, ny = state.gy;
    if (dir === "up") ny -= 1; else if (dir === "down") ny += 1;
    else if (dir === "left") nx -= 1; else if (dir === "right") nx += 1;

    if (isBlocked(state.area, nx, ny)) { render(); return; }

    const area = AREAS[state.area];
    const trans = area.transitions.find((t) => t.x === nx && t.y === ny);
    if (trans) {
      if (trans.requires && !trans.requires(state)) {
        playTone(220, 0.15);
        showToast("🔒 " + trans.blockedMsg);
        render();
        return;
      }
      state.area = trans.to;
      state.gx = trans.spawn.x; state.gy = trans.spawn.y;
      state.px = state.gx * TILE; state.py = state.gy * TILE;
      state.moving = false;
      areaNameEl.textContent = AREAS[state.area].name;
      showToast("📍 " + AREAS[state.area].name);
      saveGame();
      render();
      return;
    }

    state.gx = nx; state.gy = ny;
    state.moving = true;
    animateStep();

    const item = area.items.find((it) => it.x === nx && it.y === ny);
    if (item && !collectedItems(state.area).has(item.id)) {
      collectedItems(state.area).add(item.id);
      state.inventory.add(item.id);
      if (item.id.startsWith("crystal")) { state.crystalCount++; updateHud(); }
      playTone(880, 0.15);
      showToast(item.emoji + " " + item.label + "!");
      saveGame();
    }

    const puz = area.puzzle;
    if (puz && puz.x === nx && puz.y === ny && !state.flags[puz.flag]) {
      openPuzzle(puz);
    }
  }

  function animateStep() {
    const targetX = state.gx * TILE, targetY = state.gy * TILE;
    const speed = 6;
    function step() {
      let dx = targetX - state.px, dy = targetY - state.py;
      state.px += Math.sign(dx) * Math.min(Math.abs(dx), speed);
      state.py += Math.sign(dy) * Math.min(Math.abs(dy), speed);
      render();
      if (state.px !== targetX || state.py !== targetY) requestAnimationFrame(step);
      else state.moving = false;
    }
    requestAnimationFrame(step);
  }

  function doAction() {
    if (!puzzleOverlay.classList.contains("hidden")) return;
    if (!dlgBox.classList.contains("hidden")) { advanceDialogue(); return; }
    const { x, y } = facingCoords();
    const area = AREAS[state.area];
    const npc = area.npcs.find((n) => n.x === x && n.y === y);
    if (npc) {
      const lines = npc.getLines(state);
      openDialogue(npc.name, lines, () => npc.onComplete && npc.onComplete(state));
    }
  }

  // ---------------------------------------------------------------
  // Puzzle (Simon-says memory altar)
  // ---------------------------------------------------------------
  const puzzleCells = Array.from(document.querySelectorAll(".puzzle-cell"));
  let puzzleSeq = [], puzzleInput = [], puzzlePlaying = false, activePuzzle = null;

  function openPuzzle(puz) {
    activePuzzle = puz;
    puzzleOverlay.classList.remove("hidden");
    startPuzzleRound();
  }
  function startPuzzleRound() {
    puzzleSeq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
    puzzleInput = [];
    puzzleStatus.textContent = "Perhatikan urutannya...";
    playSequence();
  }
  function playSequence() {
    puzzlePlaying = true;
    let i = 0;
    const tick = () => {
      if (i >= puzzleSeq.length) {
        puzzlePlaying = false;
        puzzleStatus.textContent = "Giliranmu! Ulangi urutannya.";
        return;
      }
      const cell = puzzleCells[puzzleSeq[i]];
      cell.classList.add("lit");
      playTone(330 + puzzleSeq[i] * 110, 0.25);
      setTimeout(() => cell.classList.remove("lit"), 380);
      i++;
      setTimeout(tick, 620);
    };
    setTimeout(tick, 500);
  }
  puzzleCells.forEach((cell) => {
    cell.addEventListener("click", () => {
      if (puzzlePlaying) return;
      const idx = Number(cell.dataset.i);
      cell.classList.add("lit");
      setTimeout(() => cell.classList.remove("lit"), 200);
      playTone(330 + idx * 110, 0.15);
      puzzleInput.push(idx);
      const pos = puzzleInput.length - 1;
      if (puzzleInput[pos] !== puzzleSeq[pos]) {
        puzzleStatus.textContent = "Ups, coba lagi!";
        playTone(180, 0.25);
        setTimeout(startPuzzleRound, 900);
        return;
      }
      if (puzzleInput.length === puzzleSeq.length) {
        puzzleStatus.textContent = "Benar sekali! ✨";
        playTone(990, 0.3);
        state.flags[activePuzzle.flag] = true;
        setTimeout(() => {
          puzzleOverlay.classList.add("hidden");
          state.inventory.add("crystal3");
          state.crystalCount++;
          updateHud();
          showToast("💎 Kristal Ajaib #3!");
          saveGame();
        }, 900);
      }
    });
  });
  $("puzzle-close").addEventListener("click", () => puzzleOverlay.classList.add("hidden"));

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function render() {
    const area = AREAS[state.area];
    ctx.fillStyle = area.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < area.grid.length; y++) {
      for (let x = 0; x < area.grid[y].length; x++) {
        const wall = area.grid[y][x] === "#";
        ctx.fillStyle = wall ? area.wall : area.floor;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (wall) {
          ctx.font = "28px serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(area.wallEmoji, x * TILE + TILE / 2, y * TILE + TILE / 2 + 2);
        }
      }
    }

    area.transitions.forEach((t) => drawEmoji("🚪", t.x, t.y));
    if (area.puzzle && !state.flags[area.puzzle.flag]) drawEmoji("🔮", area.puzzle.x, area.puzzle.y);
    area.items.forEach((it) => { if (!collectedItems(state.area).has(it.id)) drawEmoji(it.emoji, it.x, it.y); });
    area.npcs.forEach((n) => drawEmoji(n.emoji, n.x, n.y, true));

    const dirEmoji = { up: "🧑‍🦱", down: "🧑", left: "🧑‍🦰", right: "🧑‍🦳" };
    ctx.font = "30px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🧒", state.px + TILE / 2, state.py + TILE / 2 + 2);
  }
  function drawEmoji(char, x, y, big) {
    ctx.font = (big ? "30px" : "26px") + " serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(char, x * TILE + TILE / 2, y * TILE + TILE / 2 + 2);
  }

  // ---------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------
  function updateHud() {
    crystalCountEl.textContent = `💎 ${state.crystalCount}/3`;
  }
  function tickTimer() {
    if (!state.startTime) return;
    const s = Math.floor((Date.now() - state.startTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    timerEl.textContent = `⏱ ${mm}:${ss}`;
  }
  setInterval(tickTimer, 1000);

  // ---------------------------------------------------------------
  // Save / load
  // ---------------------------------------------------------------
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        playerName: state.playerName, area: state.area, gx: state.gx, gy: state.gy,
        inventory: Array.from(state.inventory), crystalCount: state.crystalCount,
        flags: { ...state.flags, ...Object.fromEntries(
          Object.entries(state.flags).filter(([k, v]) => v instanceof Set).map(([k, v]) => [k, Array.from(v)])
        ) },
        startTime: state.startTime,
      }));
    } catch (e) { /* storage unavailable, ignore */ }
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.playerName = d.playerName || "";
      state.area = d.area || "village";
      state.gx = d.gx ?? 5; state.gy = d.gy ?? 4;
      state.inventory = new Set(d.inventory || []);
      state.crystalCount = d.crystalCount || 0;
      state.startTime = d.startTime || Date.now();
      for (const [k, v] of Object.entries(d.flags || {})) {
        state.flags[k] = Array.isArray(v) ? new Set(v) : v;
      }
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------
  // Supabase leaderboard
  // ---------------------------------------------------------------
  async function submitScore(name, crystals, seconds) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/game_scores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ player_name: name, crystals_collected: crystals, time_seconds: seconds, completed: true }),
      });
    } catch (e) { /* offline or blocked, ignore silently */ }
  }
  async function loadLeaderboard() {
    const el = $("leaderboard");
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/game_scores?select=player_name,time_seconds,crystals_collected&completed=eq.true&order=time_seconds.asc&limit=10`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) { el.innerHTML = "<em>Jadilah yang pertama di papan peringkat!</em>"; return; }
      el.innerHTML = "<strong>🏆 Tercepat</strong><ol>" + rows.map((r) => {
        const m = String(Math.floor(r.time_seconds / 60)).padStart(2, "0");
        const s = String(r.time_seconds % 60).padStart(2, "0");
        return `<li>${escapeHtml(r.player_name)} — ${m}:${s} (💎${r.crystals_collected})</li>`;
      }).join("") + "</ol>";
    } catch (e) {
      el.innerHTML = "<em>Papan peringkat tidak tersedia saat ini.</em>";
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------------------------------------------------------------
  // End game
  // ---------------------------------------------------------------
  window.__endGame = function endGame() {
    const seconds = Math.floor((Date.now() - state.startTime) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    $("end-summary").textContent = `${state.playerName}, kamu menemukan 3 Kristal Ajaib dalam ${mm}:${ss}! 🎉`;
    gameScreen.classList.add("hidden");
    endScreen.classList.remove("hidden");
    spawnConfetti();
    submitScore(state.playerName, state.crystalCount, seconds).then(loadLeaderboard);
    localStorage.removeItem(SAVE_KEY);
  };
  function spawnConfetti() {
    const emojis = ["🎉", "✨", "💎", "🎊", "⭐"];
    for (let i = 0; i < 24; i++) {
      const s = document.createElement("span");
      s.className = "confetti-emoji";
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      s.style.left = Math.random() * 100 + "%";
      s.style.animationDuration = 2 + Math.random() * 2 + "s";
      s.style.animationDelay = Math.random() * 0.6 + "s";
      endScreen.appendChild(s);
      setTimeout(() => s.remove(), 4500);
    }
  }

  // ---------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------
  const KEY_DIR = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("hidden")) return;
    if (KEY_DIR[e.key]) { e.preventDefault(); tryMove(KEY_DIR[e.key]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doAction(); }
  });
  document.querySelectorAll("#dpad button[data-dir]").forEach((btn) => {
    btn.addEventListener("click", () => tryMove(btn.dataset.dir));
  });
  $("action-btn").addEventListener("click", doAction);
  $("mute-btn").addEventListener("click", () => {
    state.muted = !state.muted;
    $("mute-btn").textContent = state.muted ? "🔇" : "🔊";
  });

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  function startNewGame(name) {
    state.playerName = name;
    state.area = "village"; state.gx = 5; state.gy = 4;
    state.px = state.gx * TILE; state.py = state.gy * TILE;
    state.inventory = new Set(); state.crystalCount = 0; state.flags = {};
    state.startTime = Date.now();
    beginGameUI();
  }
  function resumeGame() {
    state.px = state.gx * TILE; state.py = state.gy * TILE;
    beginGameUI();
  }
  function beginGameUI() {
    startScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    document.querySelectorAll(".confetti-emoji").forEach((n) => n.remove());
    gameScreen.classList.remove("hidden");
    areaNameEl.textContent = AREAS[state.area].name;
    updateHud();
    render();
  }

  $("start-btn").addEventListener("click", () => {
    const name = ($("player-name").value || "Petualang").trim().slice(0, 20) || "Petualang";
    startNewGame(name);
  });
  $("player-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("start-btn").click(); });
  $("replay-btn").addEventListener("click", () => {
    endScreen.classList.add("hidden");
    startScreen.classList.remove("hidden");
    $("player-name").value = state.playerName;
  });

  if (loadGame() && state.crystalCount < 3) {
    $("player-name").value = state.playerName;
  }
})();
