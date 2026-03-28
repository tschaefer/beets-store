/**
 * Socket.IO client instance for receiving real-time updates about album download jobs.
 * @type {Socket}
 */
const albumNotifySocket = io();

/**
 * Get the current album ID from album details page.
 * @returns {string|null} The album ID, or null if not found.
 */
function albumGetAlbumId() {
  const el = document.getElementById("album-data");
  if (!el) return null;

  return JSON.parse(el.textContent).album.id;
}

/**
 * Attach a click event listener to the album download button.
 * The listener will send a request to start the download job and handle the response.
 */
function albumAttachDownloadButton() {
  const btn = document.getElementById("btn-get-album");
  if (!btn || btn.dataset.listenerAttached) return;

  btn.dataset.listenerAttached = "true";

  btn.addEventListener("click", () => {
    btn.disabled = true;

    const xhr = new XMLHttpRequest();
    let data;

    xhr.open("GET", `/album/${albumGetAlbumId()}/file`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");

    xhr.onload = () => {
      if (xhr.status === 200) {
        data = JSON.parse(xhr.responseText);
        const link = document.createElement("a");
        link.href = data.url;
        link.click();
        btn.disabled = false;
      } else if (xhr.status === 202) {
        data = JSON.parse(xhr.responseText);
        albumNotifySocket.emit("watch_job", { job: data.job });
      }
    };

    xhr.onerror = () => {
      btn.disabled = false;
    };

    xhr.send();
  });
}

/**
 * Show a toast notification on album download success or failure.
 * @param {string} html - The HTML content of the toast.
 * @param {boolean} autohide - Whether the toast should automatically hide after a delay.
 */
function albumShowToast(html, autohide) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild;

  container.appendChild(el);

  const toast = new bootstrap.Toast(el, { autohide: autohide, delay: 8000 });
  toast.show();

  el.addEventListener("hidden.bs.toast", () => el.remove());
}

/**
 * Handle the "download_ready" event from the server.
 * Enable the download button if it matches the current album, and show a success toast.
 * @param {Object} data - The data received from the server, containing album details and download URL.
 */
function albumDownloadReady(data) {
  const btn = document.getElementById("btn-get-album");
  if (btn && data.album_id === albumGetAlbumId()) {
    btn.disabled = false;
  }

  const label = `${data.albumartist} \u00b7 ${data.album}`;
  const art = data.artpath
    ? `<img src="${data.artpath}" class="toast-art rounded-start" alt="">`
    : `<div class="toast-art-placeholder rounded-start"></div>`;

  albumShowToast(
    '<div class="toast overflow-hidden">' +
      '<div class="d-flex align-items-stretch">' +
      art +
      '<div class="toast-body d-flex align-items-center gap-2 overflow-hidden">' +
      '<i class="fa-solid fa-download flex-shrink-0"></i>' +
      '<a href="' +
      data.url +
      '" class="text-white text-decoration-none text-truncate">' +
      label +
      "</a>" +
      "</div>" +
      '<button type="button" class="btn-close btn-close-white flex-shrink-0 me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      "</div>" +
      "</div>",
    true,
  );
}

/**
 * Handle the "download_failed" event from the server.
 * Enable the download button if it matches the current album, and show a failure toast.
 * @param {Object} data - The data received from the server, containing album details.
 */
function albumDownloadFailed(data) {
  const btn = document.getElementById("btn-get-album");
  if (btn && data.album_id === albumGetAlbumId()) {
    btn.disabled = false;
  }

  const label = `${data.albumartist} \u00b7 ${data.album}`;
  albumShowToast(
    '<div class="toast text-bg-danger">' +
      '<div class="d-flex">' +
      '<div class="toast-body d-flex align-items-center gap-2 overflow-hidden">' +
      '<i class="fa-solid fa-circle-exclamation flex-shrink-0"></i>' +
      '<span class="text-truncate">' +
      label +
      " \u2014 download failed.</span>" +
      "</div>" +
      '<button type="button" class="btn-close btn-close-white flex-shrink-0 me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      "</div>" +
      "</div>",
    false,
  );
}


albumAttachDownloadButton();
document.addEventListener("htmx:afterSwap", albumAttachDownloadButton);
albumNotifySocket.on("download_ready", albumDownloadReady);
albumNotifySocket.on("download_failed", albumDownloadFailed);
