/* ==========================================================================
   MindWell — intro sequence

   Builds a one-off overlay: scattered particles converge onto a ring, the
   ring draws itself, a crescent moon fades in, then the greeting resolves.

   Presentation only. Nothing here touches auth, Firestore, or app state.
   Exposes window.MindWellIntro.play({ hello, name, once }).
   ========================================================================== */

(function () {
  "use strict";

  var PARTICLE_COUNT = 44;
  var RING_RADIUS_RATIO = 52 / 120; // matches the SVG viewBox ring
  var TOTAL_MS = 3600;

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buildParticles(stage) {
    var size = stage.offsetWidth || 260;
    var centre = size / 2;
    var radius = size * RING_RADIUS_RATIO;
    var frag = document.createDocumentFragment();

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      // Spread evenly around the ring, jittered so it doesn't look mechanical.
      var angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.16;
      var r = radius + (Math.random() - 0.5) * 5;
      var x = centre + Math.cos(angle) * r;
      var y = centre + Math.sin(angle) * r;

      // Start point: same bearing, flung far out beyond the viewport edge.
      var throwOut = 260 + Math.random() * 420;
      var dot = document.createElement("span");
      dot.className = "intro-particle";
      dot.style.left = x.toFixed(1) + "px";
      dot.style.top = y.toFixed(1) + "px";
      dot.style.setProperty("--sx", (Math.cos(angle) * throwOut).toFixed(1) + "px");
      dot.style.setProperty("--sy", (Math.sin(angle) * throwOut).toFixed(1) + "px");
      dot.style.animationDelay = (Math.random() * 0.45).toFixed(2) + "s";
      dot.style.width = dot.style.height = (2 + Math.random() * 2.4).toFixed(1) + "px";
      frag.appendChild(dot);
    }

    stage.appendChild(frag);
  }

  function play(opts) {
    opts = opts || {};
    var hello = opts.hello || "Welcome";
    var name = opts.name || "MindWell";
    var storageKey = "mindwell.intro.seen";

    // ?intro in the URL forces a replay — handy while tuning the sequence.
    var forced = window.location.search.indexOf("intro") !== -1;

    // Only once per browser session, unless forced or told otherwise.
    if (opts.once !== false && !forced) {
      try {
        if (sessionStorage.getItem(storageKey)) return;
        sessionStorage.setItem(storageKey, "1");
      } catch (e) {
        /* private mode or blocked storage — just play it */
      }
    }

    var overlay = document.createElement("div");
    overlay.id = "intro";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML =
      '<div class="intro-stage">' +
        '<svg class="intro-mark" viewBox="0 0 120 120" aria-hidden="true">' +
          "<defs>" +
            '<mask id="mw-moon-mask">' +
              '<rect width="120" height="120" fill="black"/>' +
              '<circle cx="60" cy="60" r="30" fill="white"/>' +
              '<circle cx="75" cy="51" r="27" fill="black"/>' +
            "</mask>" +
          "</defs>" +
          '<circle class="intro-ring" cx="60" cy="60" r="52"/>' +
          '<circle class="intro-moon" cx="60" cy="60" r="30" mask="url(#mw-moon-mask)"/>' +
        "</svg>" +
      "</div>" +
      '<div class="intro-words">' +
        '<p class="intro-hello"></p>' +
        '<p class="intro-name"></p>' +
      "</div>" +
      '<div class="intro-skip">click anywhere to skip</div>';

    // textContent, not innerHTML — `name` can carry a user's email.
    overlay.querySelector(".intro-hello").textContent = hello;
    overlay.querySelector(".intro-name").textContent = name;

    document.body.appendChild(overlay);

    var stage = overlay.querySelector(".intro-stage");
    if (!reduceMotion) buildParticles(stage);

    var finished = false;
    var timers = [];

    function finish() {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      overlay.classList.add("done");
      document.removeEventListener("click", finish);
      document.removeEventListener("keydown", finish);
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 950);
    }

    if (reduceMotion) {
      timers.push(setTimeout(finish, 1400));
    } else {
      // Particles dissolve once the ring has drawn over them.
      timers.push(setTimeout(function () {
        var dots = stage.querySelectorAll(".intro-particle");
        for (var i = 0; i < dots.length; i++) {
          dots[i].classList.add("settle");
          dots[i].style.animationDelay = (i * 0.008).toFixed(3) + "s";
        }
      }, 2300));

      timers.push(setTimeout(finish, TOTAL_MS));
    }

    document.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
  }

  window.MindWellIntro = { play: play };
})();
