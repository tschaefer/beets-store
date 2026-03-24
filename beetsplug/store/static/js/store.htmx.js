// HTMX navigation progress bar.
(function () {
  'use strict';

  var bar = document.getElementById('nav-progress');
  var _timer = null;

  // Start the progress bar on HTMX requests targeting #page-content.
  document.body.addEventListener('htmx:beforeRequest', function (e) {
    if (e.detail.target.id !== 'page-content') return;

    clearTimeout(_timer);

    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.style.opacity = '1';
    bar.getBoundingClientRect();
    bar.style.transition = 'width 0.8s ease, opacity 0.3s ease';
    bar.style.width = '75%';
  });

  // Complete the progress bar on successful swaps, then fade out.
  document.body.addEventListener('htmx:afterSwap', function (e) {
    if (e.detail.target.id !== 'page-content') return;

    bar.style.transition = 'width 0.15s ease, opacity 0.3s ease';
    bar.style.width = '100%';

    _timer = setTimeout(function () {
      bar.style.opacity = '0';
      _timer = setTimeout(function () { bar.style.width = '0%'; }, 300);
    }, 150);
  });

  // Handle errors by fading out the bar immediately.
  document.body.addEventListener('htmx:sendError', function (e) {
    if (e.detail.target.id !== 'page-content') return;

    clearTimeout(_timer);

    bar.style.transition = 'opacity 0.3s ease';
    bar.style.opacity = '0';
    _timer = setTimeout(function () { bar.style.width = '0%'; }, 300);
  });

  // Re-run page-specific scripts after every HTMX swap.
  document.body.addEventListener('htmx:afterSwap', function (e) {
    if (e.detail.target.id !== 'page-content') return;

    var doc = new DOMParser().parseFromString(e.detail.xhr.responseText, 'text/html');

    doc.querySelectorAll('#page-scripts script').forEach(function (s) {
      var n = document.createElement('script');

      if (s.src) n.src = s.src; else n.textContent = s.textContent;

      document.body.appendChild(n);
    });
  });

  // Exclude media links from HTMX boost.
  document.body.addEventListener('htmx:configRequest', function (e) {
    var path = e.detail.path || '';

    if (path.startsWith('/media/')) e.preventDefault();
  });
}());
