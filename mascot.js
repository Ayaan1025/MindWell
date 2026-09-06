/* ==========================================================================
   MindWell — Luna, the companion mascot

   An original character: a small round moon-robot with a glowing antenna,
   built to sit alongside the crescent-moon mark from the intro sequence.
   Pure inline SVG so there are no image assets to load and every part can
   be animated and re-themed from CSS.

   Anatomy, in viewBox units (0 0 120 140):
     antenna tip   (60, 17)
     body          x 24..96, y 34..116
     visor         x 34..86, y 48..82
     waving arm    pivots at (96.5, 70)
   ========================================================================== */

export function mascotSVG() {
  return `
<svg class="mascot" viewBox="0 0 120 140" role="img" aria-label="Luna, the MindWell companion, waving">
  <defs>
    <linearGradient id="mw-shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#f4eefb"/>
      <stop offset="100%" stop-color="#cabde1"/>
    </linearGradient>
    <linearGradient id="mw-limb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#e6dcf3"/>
      <stop offset="100%" stop-color="#bfb0d8"/>
    </linearGradient>
  </defs>

  <ellipse class="mw-shadow" cx="60" cy="129" rx="22" ry="4.5"/>

  <g class="mw-float">
    <!-- antenna -->
    <line class="mw-stem" x1="60" y1="34" x2="60" y2="22"/>
    <circle class="mw-tip" cx="60" cy="17" r="5"/>

    <!-- resting arm -->
    <g class="mw-arm-rest">
      <rect x="18" y="64" width="11" height="26" rx="5.5" fill="url(#mw-limb)"/>
      <circle cx="23.5" cy="91" r="6.5" fill="url(#mw-limb)"/>
    </g>

    <!-- waving arm: pivots at the shoulder, see .mw-arm-wave in the page CSS -->
    <g class="mw-arm-wave">
      <rect x="91" y="42" width="11" height="30" rx="5.5" fill="url(#mw-limb)"/>
      <circle cx="96.5" cy="40" r="7" fill="url(#mw-limb)"/>
    </g>

    <!-- feet -->
    <rect x="41" y="110" width="15" height="13" rx="6.5" fill="url(#mw-limb)"/>
    <rect x="64" y="110" width="15" height="13" rx="6.5" fill="url(#mw-limb)"/>

    <!-- body -->
    <rect x="24" y="34" width="72" height="82" rx="32" fill="url(#mw-shell)"/>

    <!-- visor -->
    <rect class="mw-visor" x="34" y="48" width="52" height="34" rx="17"/>

    <!-- face -->
    <ellipse class="mw-eye mw-eye-l" cx="49" cy="65" rx="5" ry="6"/>
    <ellipse class="mw-eye mw-eye-r" cx="71" cy="65" rx="5" ry="6"/>
    <path class="mw-smile" d="M54 74 Q60 79 66 74"/>

    <!-- cheeks -->
    <circle class="mw-cheek" cx="40" cy="90" r="4.5"/>
    <circle class="mw-cheek" cx="80" cy="90" r="4.5"/>
  </g>
</svg>`.trim();
}
