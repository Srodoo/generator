(() => {
  "use strict";

  const VERSION = "20260908-interaction-v3";
  const GAME_IDS = ["miniBtn", "lottoBtn", "euroBtn", "multiBtn", "extraBtn"];
  const GAME_KEY_BY_ID = {
    miniBtn: "mini",
    lottoBtn: "lotto",
    euroBtn: "euro",
    multiBtn: "multi",
    extraBtn: "extra"
  };

  let deferredInstallPrompt = null;

  // Nie zakładamy, że localStorage/sessionStorage są dostępne.
  // Niektóre przeglądarki / tryby prywatności potrafią rzucić SecurityError
  // już przy samym odczycie i zatrzymać cały skrypt mobilny.
  function safeStorageGet(storageName, key, fallback = null) {
    try {
      const storage = window[storageName];
      const value = storage?.getItem(key);
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(storageName, key, value) {
    try {
      window[storageName]?.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  let lastGameId = safeStorageGet("localStorage", "lottoForgeMobile.lastGame", "miniBtn");
  if (!GAME_IDS.includes(lastGameId)) lastGameId = "miniBtn";

  const bridge = () => window.LottoForgeMobileBridge || null;
  const clickById = id => {
    const element = document.getElementById(id);
    if (!element) return false;
    element.click();
    return true;
  };

  function setActiveGame(id) {
    if (!GAME_IDS.includes(id)) return;
    lastGameId = id;
    safeStorageSet("localStorage", "lottoForgeMobile.lastGame", id);
    document.querySelectorAll(".mobile-game-btn").forEach(btn => {
      const active = btn.dataset.target === id;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    setActiveNav("generator");
  }

  function setActiveNav(name) {
    document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
      const active = btn.dataset.nav === name;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function openGameById(id) {
    if (!GAME_IDS.includes(id)) return false;
    setActiveGame(id);
    const api = bridge();
    const gameKey = GAME_KEY_BY_ID[id];
    const ok = api?.openGame?.(gameKey) ?? clickById(id);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return ok !== false;
  }

  function openNav(name) {
    const api = bridge();
    let ok = false;

    if (name === "generator") ok = openGameById(lastGameId);
    if (name === "stats") ok = api?.openStats?.() ?? clickById("statsBtn");
    if (name === "lab") ok = api?.openLab?.() ?? clickById("labBtn");
    if (name === "import") ok = api?.openImport?.() ?? clickById("importBtn");

    if (name !== "import") {
      setActiveNav(name);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    return ok !== false;
  }

  // Obsługa w fazie capture + pointerup fallback.
  // Dzięki temu mobilna nawigacja nie zależy od eventów ukrytego sidebara
  // i działa stabilniej w Android/Opera/Chrome/PWA.
  let lastPointerActionAt = 0;
  let lastPointerTarget = null;

  function resolveMobileButton(target) {
    return target?.closest?.(".mobile-game-btn, .mobile-nav-btn") || null;
  }

  function executeMobileButton(button) {
    if (!button) return;
    if (button.classList.contains("mobile-game-btn")) {
      openGameById(button.dataset.target);
      return;
    }
    if (button.classList.contains("mobile-nav-btn")) {
      openNav(button.dataset.nav);
    }
  }

  document.addEventListener("pointerup", event => {
    const button = resolveMobileButton(event.target);
    if (!button) return;
    lastPointerActionAt = Date.now();
    lastPointerTarget = button;
    event.preventDefault();
    executeMobileButton(button);
  }, { capture: true, passive: false });

  document.addEventListener("click", event => {
    const button = resolveMobileButton(event.target);
    if (!button) return;
    if (button === lastPointerTarget && Date.now() - lastPointerActionAt < 650) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    executeMobileButton(button);
  }, true);

  // Synchronizacja aktywnego stanu również wtedy, gdy moduł został otwarty
  // klasycznym przyciskiem desktopowym.
  GAME_IDS.forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => setActiveGame(id));
  });
  document.getElementById("statsBtn")?.addEventListener("click", () => setActiveNav("stats"));
  document.getElementById("labBtn")?.addEventListener("click", () => setActiveNav("lab"));

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelectorAll("[data-install-app]").forEach(btn => {
      btn.hidden = false;
      btn.classList.add("ready");
    });
  });

  async function requestInstall() {
    if (!deferredInstallPrompt) {
      alert("Jeśli nie widzisz automatycznej instalacji: w Chrome/Operze wybierz menu ⋮ → Dodaj do ekranu głównego / Zainstaluj aplikację.");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.querySelectorAll("[data-install-app]").forEach(btn => {
      btn.classList.remove("ready");
      btn.hidden = true;
    });
  }

  document.querySelectorAll("[data-install-app]").forEach(btn => btn.addEventListener("click", requestInstall));

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelectorAll("[data-install-app]").forEach(btn => {
      btn.classList.remove("ready");
      btn.hidden = true;
    });
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js?v=20260908-interaction-v3", {
          updateViaCache: "none"
        });
        registration.update().catch(() => {});
      } catch (error) {
        console.warn("LottoForge SW:", error);
      }
    });
  }

  document.documentElement.classList.add("lf-mobile-js-ready");
  document.documentElement.dataset.lfMobileVersion = VERSION;
  setActiveGame(lastGameId);
  setActiveNav("generator");
  console.info(`LottoForge Mobile ${VERSION}: ready`);
})();
