(() => {
  document.addEventListener("DOMContentLoaded", () => {
    var socket = io();

    // Attach the download button handler.
    function attachDownloadButton() {
      var btn = document.getElementById("btn-get-album");
      if (!btn || btn.dataset.listenerAttached) return;

      btn.dataset.listenerAttached = "true";

      btn.addEventListener("click", () => {
        btn.disabled = true;

        var xhr = new XMLHttpRequest();
        var data;

        xhr.open("GET", `/album/${album.id}/file`, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accept", "application/json");

        xhr.onload = () => {
          if (xhr.status === 200) {
            data = JSON.parse(xhr.responseText);
            var link = document.createElement("a");
            link.href = data.url;
            link.click();
            btn.disabled = false;
          } else if (xhr.status === 202) {
            data = JSON.parse(xhr.responseText);
            socket.emit("watch_job", { job: data.job });
          }
        };

        xhr.onerror = () => { btn.disabled = false; };

        xhr.send();
      });
    }

    // Run on initial page load and after every HTMX navigation.
    attachDownloadButton();
    document.addEventListener("htmx:afterSwap", attachDownloadButton);

    // Show a toast notification.
    function showToast(html, autohide) {
      var container = document.getElementById("toast-container");
      if (!container) return;

      var wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      var el = wrapper.firstElementChild;

      container.appendChild(el);

      var toast = new bootstrap.Toast(el, { autohide: autohide, delay: 8000 });
      toast.show();

      el.addEventListener("hidden.bs.toast", () => el.remove());
    }

    // Handle a succeeded download job.
    socket.on("download_ready", (data) => {
      var btn = document.getElementById("btn-get-album");
      if (btn && typeof album !== "undefined" && data.album_id === album.id) {
        btn.disabled = false;
      }

      var label = `${data.albumartist} \u00b7 ${data.album}`;
      var art = data.artpath
        ? `<img src="${data.artpath}" class="toast-art rounded-start" alt="">`
        : `<div class="toast-art-placeholder rounded-start"></div>`;

      showToast(
        '<div class="toast overflow-hidden">' +
          '<div class="d-flex align-items-stretch">' +
            art +
            '<div class="toast-body d-flex align-items-center gap-2 overflow-hidden">' +
              '<i class="fa-solid fa-download flex-shrink-0"></i>' +
              '<a href="' + data.url + '" class="text-white text-decoration-none text-truncate">' + label + "</a>" +
            "</div>" +
            '<button type="button" class="btn-close btn-close-white flex-shrink-0 me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
          "</div>" +
        "</div>",
        true
      );
    });

    // Handle a failed download job.
    socket.on("download_failed", (data) => {
      var btn = document.getElementById("btn-get-album");
      if (btn && typeof album !== "undefined" && data.album_id === album.id) {
        btn.disabled = false;
      }

      var label = `${data.albumartist} \u00b7 ${data.album}`;
      showToast(
        '<div class="toast text-bg-danger">' +
          '<div class="d-flex">' +
            '<div class="toast-body d-flex align-items-center gap-2 overflow-hidden">' +
              '<i class="fa-solid fa-circle-exclamation flex-shrink-0"></i>' +
              '<span class="text-truncate">' + label + " \u2014 download failed.</span>" +
            "</div>" +
            '<button type="button" class="btn-close btn-close-white flex-shrink-0 me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
          "</div>" +
        "</div>",
        false
      );
    });
  });
})();
