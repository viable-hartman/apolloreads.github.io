/* ARTYSync library behaviour: privacy-friendly lazy player, chapter seeking,
   reading log ("We read this!"), bookshelf + badges, A-Z filter, surprise button.
   No cookies, no accounts: the reading log lives in this browser only. */
(function () {
  "use strict";

  var KEY = "artysync.readlog.v1";
  var BADGES = [
    [1, "🐣", "First story"], [5, "📗", "5 books"], [10, "🏅", "10 books"],
    [25, "🚀", "25 books"], [50, "🏆", "50 books"], [100, "👑", "100 books!"],
    [-3, "🔥", "3-day streak"], [-7, "🌈", "7-day streak"]
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(log) {
    try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) { /* private mode */ }
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function streak(log) {
    var days = {};
    Object.keys(log).forEach(function (id) { days[log[id].date] = true; });
    var n = 0, d = new Date();
    if (!days[today()]) d.setDate(d.getDate() - 1); // streak survives until tonight
    for (;;) {
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (!days[key]) return n;
      n++; d.setDate(d.getDate() - 1);
    }
  }

  /* ---------- player ---------- */
  function iframeFor(player, start) {
    var id = player.getAttribute("data-video-id");
    var src = player.getAttribute("data-embed") + id + "?autoplay=1&rel=0&playsinline=1" + (start ? "&start=" + start : "");
    var frame = document.createElement("iframe");
    frame.src = src;
    frame.title = "Read-along video";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    frame.allowFullscreen = true;
    player.innerHTML = "";
    player.appendChild(frame);
  }
  function initPlayers(root) {
    root.querySelectorAll(".arty-player__poster").forEach(function (poster) {
      poster.addEventListener("click", function (ev) {
        ev.preventDefault();
        iframeFor(poster.parentNode, 0);
      });
    });
    root.querySelectorAll(".arty-chapters a[data-seek]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var player = root.querySelector(".arty-player");
        if (!player) return;
        ev.preventDefault();
        iframeFor(player, parseInt(a.getAttribute("data-seek"), 10));
        player.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  /* ---------- reading log ---------- */
  function initReadLog(root) {
    var log = load();
    root.querySelectorAll(".arty-readlog").forEach(function (btn) {
      var id = btn.getAttribute("data-video");
      var paint = function () {
        var read = !!load()[id];
        btn.classList.toggle("is-read", read);
        btn.textContent = read ? "🌟 Read! Tap to undo" : "⭐ We read this!";
      };
      paint();
      btn.addEventListener("click", function () {
        var current = load();
        if (current[id]) { delete current[id]; }
        else {
          current[id] = { date: today(), title: btn.getAttribute("data-title") };
          btn.classList.remove("is-pop"); void btn.offsetWidth; btn.classList.add("is-pop");
        }
        save(current); paint();
      });
    });
    root.querySelectorAll(".arty-card[data-video]").forEach(function (card) {
      card.classList.toggle("is-read", !!log[card.getAttribute("data-video")]);
    });
  }

  /* ---------- catalog helpers ---------- */
  function fetchCatalog(el) {
    return fetch(el.getAttribute("data-catalog")).then(function (r) { return r.json(); });
  }
  function resolve(base, url) {
    try { return new URL(url, new URL(base, location.href)).href; } catch (e) { return url; }
  }

  function initSurprise(root) {
    root.querySelectorAll(".arty-surprise").forEach(function (btn) {
      btn.addEventListener("click", function () {
        fetchCatalog(btn).then(function (items) {
          var log = load();
          var books = items.filter(function (i) { return i.kind === "book"; });
          var unread = books.filter(function (i) { return !log[i.id]; });
          var pool = unread.length ? unread : (books.length ? books : items);
          var pick = pool[Math.floor(Math.random() * pool.length)];
          if (pick) location.href = resolve(btn.getAttribute("data-base"), pick.url);
        });
      });
    });
  }

  function initFilter(root) {
    var input = root.querySelector(".arty-filter__input");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      root.querySelectorAll(".arty-card").forEach(function (card) {
        var hay = ((card.getAttribute("data-title") || "") + " " + (card.getAttribute("data-by") || "")).toLowerCase();
        card.classList.toggle("is-hidden", q && hay.indexOf(q) === -1);
      });
      root.querySelectorAll(".arty-letter").forEach(function (h) {
        var grid = h.nextElementSibling;
        while (grid && !grid.classList.contains("arty-grid")) grid = grid.nextElementSibling;
        var any = grid && grid.querySelector(".arty-card:not(.is-hidden)");
        h.style.display = any ? "" : "none";
        if (grid) grid.style.display = any ? "" : "none";
      });
    });
  }

  function initBookshelf(root) {
    var shelf = root.querySelector(".arty-bookshelf");
    if (!shelf) return;
    var render = function (items) {
      var log = load();
      var read = items.filter(function (i) { return log[i.id]; })
        .sort(function (a, b) { return log[b.id].date.localeCompare(log[a.id].date); });
      var minutes = read.reduce(function (s, i) { return s + (i.minutes || 0); }, 0);
      var days = streak(log);
      shelf.querySelector(".arty-stat-books").textContent = read.length;
      shelf.querySelector(".arty-stat-minutes").textContent = minutes;
      shelf.querySelector(".arty-stat-streak").textContent = days;
      shelf.querySelector(".arty-bookshelf__empty").style.display = read.length ? "none" : "";
      shelf.querySelector(".arty-badges").innerHTML = BADGES.map(function (b) {
        var earned = b[0] > 0 ? read.length >= b[0] : days >= -b[0];
        return '<span class="arty-badge' + (earned ? " is-earned" : "") + '"><b>' + b[1] + "</b>" + b[2] + "</span>";
      }).join("");
      var base = shelf.getAttribute("data-base");
      var grid = shelf.querySelector(".arty-bookshelf__grid");
      grid.innerHTML = "";
      read.forEach(function (i) {
        var a = document.createElement("a");
        a.className = "arty-card is-read";
        a.href = resolve(base, i.url);
        var img = /^https?:/.test(i.img) ? i.img : resolve(base, i.img);
        a.innerHTML = '<span class="arty-card__img"><img loading="lazy" alt=""></span><span class="arty-card__body">' +
          '<strong class="arty-card__title"></strong><span class="arty-card__by"></span>' +
          '<span class="arty-card__meta"><span class="arty-chip">📅 ' + log[i.id].date + "</span></span></span>" +
          '<span class="arty-card__read" aria-hidden="true">⭐</span>';
        a.querySelector("img").src = img;
        a.querySelector(".arty-card__title").textContent = i.title;
        a.querySelector(".arty-card__by").textContent = i.by || "";
        grid.appendChild(a);
      });
    };
    fetchCatalog(shelf).then(function (items) {
      render(items);
      shelf.querySelector(".arty-bookshelf__clear").addEventListener("click", function () {
        if (confirm("Clear this bookshelf? This can't be undone.")) { save({}); render(items); }
      });
      shelf.querySelector(".arty-bookshelf__print").addEventListener("click", function () { window.print(); });
    });
  }

  function init() {
    var root = document;
    initPlayers(root);
    initReadLog(root);
    initSurprise(root);
    initFilter(root);
    initBookshelf(root);
  }

  // Material's instant navigation swaps pages without reloading.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
