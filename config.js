/* ==========================================================================
   MindWell — client configuration

   Public values only. Nothing secret belongs in this file: it ships to the
   browser and is committed to the repo.
   ========================================================================== */

/* Your deployed Cloudflare Worker URL, e.g.
     "https://mindwell-companion.<your-subdomain>.workers.dev"

   Leave it empty and the Companion page simply doesn't offer the cloud
   option — the on-device model still works. The URL being public is fine:
   the Worker rejects anything without a valid Firebase ID token. */
export const REMOTE_ENDPOINT = "https://mindwell-companion.ayaan1025.workers.dev";
