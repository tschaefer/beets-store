import { playerLoadAlbum } from "./store.player.js";

/**
 * Progress bar element.
 * @type {HTMLElement}
 */
const htmxProgressBar = document.getElementById("nav-progress");

/**
 * Timer handle for progress bar fade-out.
 * @type {number|null}
 */
let htmxProgressTimer = null;

/**
 * Start the progress bar on HTMX requests targeting #page-content.
 * @param {Event} e - The htmx:beforeRequest event.
 */
function htmxStartProgressBar(e) {
  if (e.detail.target.id !== "page-content") return;

  clearTimeout(htmxProgressTimer);

  htmxProgressBar.style.transition = "none";
  htmxProgressBar.style.width = "0%";
  htmxProgressBar.style.opacity = "1";
  htmxProgressBar.getBoundingClientRect();
  htmxProgressBar.style.transition = "width 0.8s ease, opacity 0.3s ease";
  htmxProgressBar.style.width = "75%";
}

/**
 * Complete the progress bar on a successful swap, then fade out.
 * @param {Event} e - The htmx:afterSwap event.
 */
function htmxCompleteProgressBar(e) {
  if (e.detail.target.id !== "page-content") return;

  htmxProgressBar.style.transition = "width 0.15s ease, opacity 0.3s ease";
  htmxProgressBar.style.width = "100%";

  htmxProgressTimer = setTimeout(() => {
    htmxProgressBar.style.opacity = "0";
    htmxProgressTimer = setTimeout(() => {
      htmxProgressBar.style.width = "0%";
    }, 300);
  }, 150);
}

/**
 * Fade out the progress bar immediately on a request error.
 * @param {Event} e - The htmx:sendError event.
 */
function htmxFailProgressBar(e) {
  if (e.detail.target.id !== "page-content") return;

  clearTimeout(htmxProgressTimer);

  htmxProgressBar.style.transition = "opacity 0.3s ease";
  htmxProgressBar.style.opacity = "0";
  htmxProgressTimer = setTimeout(() => {
    htmxProgressBar.style.width = "0%";
  }, 300);
}

/**
 * Load album data after every HTMX swap into #page-content.
 * @param {Event} e - The htmx:afterSwap event.
 */
function htmxLoadAlbumFromSwap(e) {
  if (e.detail.target.id !== "page-content") return;

  const doc = new DOMParser().parseFromString(
    e.detail.xhr.responseText,
    "text/html",
  );

  const el = doc.getElementById("album-data");
  if (!el) return;

  const data = JSON.parse(el.textContent);
  playerLoadAlbum(data.tracks, data.album);
}

/**
 * Exclude media links from HTMX boost.
 * @param {Event} e - The htmx:configRequest event.
 */
function htmxExcludeMediaRequest(e) {
  const path = e.detail.path || "";

  if (path.startsWith("/media/")) e.preventDefault();
}


document.body.addEventListener("htmx:beforeRequest", htmxStartProgressBar);
document.body.addEventListener("htmx:afterSwap", htmxCompleteProgressBar);
document.body.addEventListener("htmx:sendError", htmxFailProgressBar);
document.body.addEventListener("htmx:afterSwap", htmxLoadAlbumFromSwap);
document.body.addEventListener("htmx:configRequest", htmxExcludeMediaRequest);
