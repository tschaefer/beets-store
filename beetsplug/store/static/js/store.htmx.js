(() => {
  var bar = document.getElementById("nav-progress");
  var timer = null;

  // Start the progress bar on HTMX requests targeting #page-content.
  document.body.addEventListener("htmx:beforeRequest", (e) => {
    if (e.detail.target.id !== "page-content") return;

    clearTimeout(timer);

    bar.style.transition = "none";
    bar.style.width = "0%";
    bar.style.opacity = "1";
    bar.getBoundingClientRect();
    bar.style.transition = "width 0.8s ease, opacity 0.3s ease";
    bar.style.width = "75%";
  });

  // Complete the progress bar on successful swaps, then fade out.
  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target.id !== "page-content") return;

    bar.style.transition = "width 0.15s ease, opacity 0.3s ease";
    bar.style.width = "100%";

    timer = setTimeout(() => {
      bar.style.opacity = "0";
      timer = setTimeout(() => {
        bar.style.width = "0%";
      }, 300);
    }, 150);
  });

  // Handle errors by fading out the bar immediately.
  document.body.addEventListener("htmx:sendError", (e) => {
    if (e.detail.target.id !== "page-content") return;

    clearTimeout(timer);

    bar.style.transition = "opacity 0.3s ease";
    bar.style.opacity = "0";
    timer = setTimeout(() => {
      bar.style.width = "0%";
    }, 300);
  });

  // Load album data after every HTMX swap into #page-content.
  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target.id !== "page-content") return;

    var doc = new DOMParser().parseFromString(
      e.detail.xhr.responseText,
      "text/html",
    );

    var el = doc.getElementById("album-data");
    if (!el || !window.loadAlbum) return;

    var data = JSON.parse(el.textContent);
    window.loadAlbum(data.tracks, data.album);
  });

  // Exclude media links from HTMX boost.
  document.body.addEventListener("htmx:configRequest", (e) => {
    var path = e.detail.path || "";

    if (path.startsWith("/media/")) e.preventDefault();
  });
})();
