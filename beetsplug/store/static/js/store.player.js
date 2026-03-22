(function () {
  'use strict';

  // --- State ---

  // What the player is actually playing — only changes on explicit user action.
  var _playerTracks = [];
  var _playerAlbum = {};
  var _index = 0;
  var _isPlaying = false;

  // What the currently visited album page has — updated on every loadAlbum() call.
  var _pageTracks = [];
  var _pageAlbum = {};

  // --- DOM ---

  var audio = document.getElementById('audio');
  var playerBar = document.getElementById('player-bar');
  var progressBar = document.getElementById('player-progress');
  var progressFill = document.getElementById('player-progress-fill');

  // --- Storage ---

  // Save the current player state to local storage.
  function saveState(idx, pos) {
    try {
      localStorage.setItem('playerState', JSON.stringify({
        albumId: _playerAlbum.id,
        album: _playerAlbum.album,
        albumartist: _playerAlbum.albumartist,
        artUrl: _playerAlbum._artUrl || '',
        index: idx,
        position: Math.floor(pos) || 0,
        tracks: _playerTracks
      }));
    } catch (e) {}
  }

  // Read the player state from local storage, or return null if not found or invalid.
  function readState() {
    try {
      var raw = localStorage.getItem('playerState');

      if (!raw) return null;

      var s = JSON.parse(raw);

      if (!s || !Array.isArray(s.tracks) || !s.tracks.length) return null;

      return s;
    } catch (e) {
      return null;
    }
  }

  // --- LastFM ---

  // Notify the backend of the currently playing track or a scrobble event.
  function sendLastFM(method, trackId) {
    if (!trackId) return;
    var xhr = new XMLHttpRequest();

    xhr.open('POST', '/lastfm/', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send(JSON.stringify({ method: method, track: trackId }));
  }

  // Show or hide the LastFM icon in the player bar based on the presence of the cookie.
  function showHideLastFMIcon() {
    var el = document.getElementById('player-lastfm');

    if (!el) return;

    var visible = document.cookie.split(';').some(function (c) {
      return c.trim().startsWith('lastfm=');
    });

    el.style.display = visible ? 'inline' : 'none';
  }

  // --- Display ---

  // Update the play/pause button icon based on the current playback state.
  function updatePlayPauseIcon() {
    var icon = document.querySelector('.btn-playpause span');

    if (icon) icon.className = _isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  }

  // Update the player bar display (artwork, track and album info) based on the current track.
  function updatePlayerDisplay() {
    var hintEl = document.getElementById('player-hint');
    var artEl = document.getElementById('player-art');
    var linkEl = document.getElementById('player-art-link');
    var trackEl = document.getElementById('player-track');
    var albumEl = document.getElementById('player-album');
    var t = _playerTracks[_index];

    if (hintEl) hintEl.style.display = 'none';

    if (linkEl) {
      var albumUrl = '/album/' + _playerAlbum.id + '/';
      linkEl.style.display = 'flex';
      linkEl.href = albumUrl;
      linkEl.setAttribute('hx-get', albumUrl);
      linkEl.setAttribute('hx-target', '#page-content');
      linkEl.setAttribute('hx-select', '#page-content');
      linkEl.setAttribute('hx-select-oob', '#navbar-form');
      linkEl.setAttribute('hx-push-url', 'true');
      linkEl.setAttribute('hx-swap', 'innerHTML');

      if (window.htmx) htmx.process(linkEl);
    }
    if (artEl) artEl.src = _playerAlbum._artUrl || '';
    if (trackEl) trackEl.textContent = t ? t.title : '';
    if (albumEl) albumEl.textContent = _playerAlbum.albumartist + ' \u00b7 ' + _playerAlbum.album;
  }

  // Show a marker next to the currently playing track in the page track list, if present.
  function setTrackMarker(oneBasedIdx) {
    document.querySelectorAll('[id^="track-marker-"]').forEach(function (el) {
      el.style.display = 'none';
    });

    var marker = document.getElementById('track-marker-' + oneBasedIdx);

    if (marker) marker.style.display = '';
  }

  // --- Playback ---

  // Load the specified track index into the audio element, update the display and save the state.
  function loadTrack(lastIdx, idx, pos) {
    audio.src = _playerTracks[idx].file;
    progressFill.style.width = '0%';
    updatePlayerDisplay();
    setTrackMarker(idx + 1);
    saveState(idx, pos || 0);
  }

  // Update the progress bar fill as the track plays.
  audio.addEventListener('timeupdate', function () {
    if (!audio.duration) return;

    progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  });

  // When the user seeks, update the state with the new position.
  audio.addEventListener('seeked', function () {
    if (_playerTracks.length) {
      saveState(_index, audio.currentTime);
    }
  });

  // When a track starts playing, update the state and notify LastFM.
  audio.addEventListener('play', function () {
    _isPlaying = true;
    updatePlayPauseIcon();
    startWaveAnimation();

    var heart = document.getElementById('navbar-heart');

    if (heart) heart.classList.add('playing', 'fa-beat-fade');
  });

  // When a track is paused, update the state and notify LastFM.
  audio.addEventListener('pause', function () {
    _isPlaying = false;
    updatePlayPauseIcon();
    stopWaveAnimation();

    var heart = document.getElementById('navbar-heart');

    if (heart) heart.classList.remove('playing', 'fa-beat-fade');
  });

  // When a track ends, scrobble it to LastFM and load the next track if available.
  audio.addEventListener('ended', function () {
    sendLastFM('scrobble', _playerTracks[_index].id);

    if ((_index + 1) < _playerTracks.length) {
      loadTrack(_index, ++_index);
      audio.play().catch(function (e) { console.warn('Playback failed:', e); });
      sendLastFM('now_playing', _playerTracks[_index].id);
    } else {
      var last = _index;

      _index = 0;
      loadTrack(last, _index);
    }
  });

  // When the user clicks on the progress bar, seek to the corresponding position.
  progressBar.addEventListener('click', function (e) {
    if (!audio.duration) return;

    var rect = progressBar.getBoundingClientRect();

    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // Save position every 10 seconds while playing.
  setInterval(function () {
    if (_isPlaying && _playerTracks.length) {
      saveState(_index, audio.currentTime);
    }
  }, 10000);

  // --- Waveform ---

  var _waveAnimId = null;
  var _waveCanvas = null;
  var _waveCtx = null;
  var _analyser = null;
  var _waveData = null;
  var _mediaSource = null;

  // Initialize the waveform canvas and set up a ResizeObserver to handle resizes.
  function initWaveform() {
    var container = document.getElementById('waveform');

    if (!container) return;

    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');

    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    _waveCanvas = canvas;
    _waveCtx = canvas.getContext('2d');

    new ResizeObserver(function () {
      var w = container.clientWidth;
      var h = container.clientHeight;

      if (!w || !h) return;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      _waveCtx.scale(dpr, dpr);

      if (!_waveAnimId) drawWave();
    }).observe(container);
  }

  // AudioContext is created lazily on first play to satisfy browser autoplay policy.
  function ensureAudioContext() {
    if (_analyser) return;

    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!_mediaSource) _mediaSource = ctx.createMediaElementSource(audio);

    _analyser = ctx.createAnalyser();
    _analyser.fftSize = 2048;
    _analyser.smoothingTimeConstant = 0.0;
    _waveData = new Uint8Array(_analyser.frequencyBinCount);

    _mediaSource.connect(_analyser);
    _analyser.connect(ctx.destination);
  }

  // Draw the current audio waveform onto the canvas.
  function drawWave() {
    if (!_waveCtx || !_waveCanvas || !_analyser) return;

    var dpr = window.devicePixelRatio || 1;
    var w = _waveCanvas.width / dpr;
    var h = _waveCanvas.height / dpr;

    if (!w || !h) return;

    _analyser.getByteTimeDomainData(_waveData);

    var n = _waveData.length;
    _waveCtx.clearRect(0, 0, w, h);

    var cs = getComputedStyle(document.documentElement);
    _waveCtx.beginPath();
    _waveCtx.strokeStyle = cs.getPropertyValue('--bs-secondary-color').trim();
    _waveCtx.lineWidth = 1;
    _waveCtx.lineJoin = 'round';

    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * w;
      var y = ((_waveData[i] / 128.0) - 1.0) * (h / 2) + (h / 2);
      if (i === 0) _waveCtx.moveTo(x, y);
      else _waveCtx.lineTo(x, y);
    }

    _waveCtx.stroke();
  }

  // Animation loop to continuously update the waveform while playing.
  function _animateWave() {
    drawWave();
    _waveAnimId = requestAnimationFrame(_animateWave);
  }

  // Start the waveform animation when playback starts.
  function startWaveAnimation() {
    ensureAudioContext();

    if (!_waveAnimId) _waveAnimId = requestAnimationFrame(_animateWave);
  }

  // Stop the waveform animation when playback pauses or ends.
  function stopWaveAnimation() {
    if (_waveAnimId) {
      cancelAnimationFrame(_waveAnimId);
      _waveAnimId = null;
    }
  }

  // --- Controls ---

  // Play/pause toggle.
  document.querySelector('.btn-playpause').addEventListener('click', function () {
    this.blur();

    if (!_playerTracks.length) return;

    if (_isPlaying) {
      audio.pause().catch(function (e) { console.warn('Pause failed:', e); });
    } else {
      audio.play().catch(function (e) { console.warn('Playback failed:', e); });
      sendLastFM('now_playing', _playerTracks[_index].id);
    }
  });

  // Next track.
  document.querySelector('.btn-next').addEventListener('click', function () {
    this.blur();

    if ((_index + 1) < _playerTracks.length) {
      loadTrack(_index, ++_index);

      if (_isPlaying) {
        audio.play().catch(function (e) { console.warn('Playback failed:', e); });
        sendLastFM('now_playing', _playerTracks[_index].id);
      }
    }
  });

  // Previous track.
  document.querySelector('.btn-prev').addEventListener('click', function () {
    this.blur();

    if ((_index - 1) > -1) {
      loadTrack(_index, --_index);

      if (_isPlaying) {
        audio.play().catch(function (e) { console.warn('Playback failed:', e); });
        sendLastFM('now_playing', _playerTracks[_index].id);
      }
    }
  });

  // Eject track from the page track list into the player.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-eject');

    if (!btn) return;

    btn.blur();
    _playerTracks = _pageTracks;
    _playerAlbum = _pageAlbum;
    _index = parseInt(btn.value, 10) - 1;
    loadTrack(_index, _index);

    if (_isPlaying) {
      audio.play().catch(function (e) { console.warn('Playback failed:', e); });
      sendLastFM('now_playing', _playerTracks[_index].id);
    }
  });

  // --- Public API ---

  // This function is called by the album page on every load with the current page's track list and album info.
  window.loadAlbum = function (tracks, album) {
    _pageTracks = tracks;
    _pageAlbum = album;

    var pageArt = document.querySelector('#page-content .card img');
    _pageAlbum._artUrl = album._artUrl || (pageArt ? pageArt.src : '');

    showHideLastFMIcon();

    if (_playerTracks.length) {
      var currentFile = _playerTracks[_index].file;
      var matchIdx = -1;
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].file === currentFile) { matchIdx = i; break; }
      }
      if (matchIdx >= 0) setTrackMarker(matchIdx + 1);
    }
  };

  // --- Init ---

  playerBar.style.display = 'block';
  document.body.classList.add('player-active');
  showHideLastFMIcon();
  initWaveform();

  // On page load, try to restore the player state from local storage and resume playback if possible.
  var _saved = readState();

  if (_saved) {
    _playerTracks = _saved.tracks;
    _playerAlbum = {
      id: _saved.albumId,
      album: _saved.album,
      albumartist: _saved.albumartist,
      _artUrl: _saved.artUrl
    };
    _index = _saved.index;
    loadTrack(_index, _index, _saved.position);

    if (_saved.position > 0) {
      audio.addEventListener('canplay', function seek() {
        audio.currentTime = _saved.position;
        audio.removeEventListener('canplay', seek);
      });
    }
  }
}());
