(() => {
  "use strict";

  const GAME_IDS = ["miniBtn", "lottoBtn", "euroBtn", "multiBtn", "extraBtn"];
  let lastGameId = localStorage.getItem("lottoForgeMobile.lastGame") || "miniBtn";
  let deferredInstallPrompt = null;

  const clickById = id => document.getElementById(id)?.click();

  function setActiveGame(id) {
    if (!GAME_IDS.includes(id)) return;
    lastGameId = id;
    localStorage.setItem("lottoForgeMobile.lastGame", id);
    document.querySelectorAll(".mobile-game-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === id);
    });
    setActiveNav("generator");
  }

  function setActiveNav(name) {
    document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.nav === name);
    });
  }

  GAME_IDS.forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => setActiveGame(id));
  });

  document.querySelectorAll(".mobile-game-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.target;
      setActiveGame(id);
      clickById(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (nav === "generator") clickById(lastGameId);
      if (nav === "stats") clickById("statsBtn");
      if (nav === "lab") clickById("labBtn");
      if (nav === "import") clickById("importBtn");
      if (nav !== "import") {
        setActiveNav(nav);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
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
      alert("Jeśli nie widzisz automatycznej instalacji: w Chrome wybierz menu ⋮ → Dodaj do ekranu głównego / Zainstaluj aplikację.");
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
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("LottoForge SW:", error);
      });
    });
  }

  setActiveGame(lastGameId);
  setActiveNav("generator");
})();
