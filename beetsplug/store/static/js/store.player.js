(() => {
  // --- State ---

  // Player state.
  var playerTracks = [];
  var playerAlbum = {};
  var index = 0;
  var isPlaying = false;

  // Album page state.
  var pageTracks = [];
  var pageAlbum = {};

  // BroadcastChannel for cross-tab stop-on-play behavior.
  var broadcast = window.BroadcastChannel
    ? new BroadcastChannel("beets-store-player")
    : null;

  // --- DOM ---

  var audio = document.getElementById("audio");
  var playerBar = document.getElementById("player-bar");
  var progressBar = document.getElementById("player-progress");
  var progressFill = document.getElementById("player-progress-fill");

  // --- Storage ---

  // Save the current player state to local storage.
  function saveState(idx, pos) {
    try {
      localStorage.setItem(
        "playerState",
        JSON.stringify({
          albumId: playerAlbum.id,
          album: playerAlbum.album,
          albumartist: playerAlbum.albumartist,
          artUrl: playerAlbum.artUrl || "",
          index: idx,
          position: Math.floor(pos) || 0,
          tracks: playerTracks,
        }),
      );
    } catch (e) {
        console.warn("Failed to save player state:", e);
    }
  }

  // Read the player state from local storage, or return null if not found or invalid.
  function readState() {
    try {
      var raw = localStorage.getItem("playerState");
      if (!raw) return null;

      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.tracks) || !s.tracks.length) return null;

      return s;
    } catch (e) {
      console.warn("Failed to read player state:", e);
      return null;
    }
  }

  // --- LastFM ---

  // Notify the backend of the currently playing track or a scrobble event.
  function sendLastFM(method, trackId) {
    if (!trackId) return;
    var xhr = new XMLHttpRequest();

    xhr.open("POST", "/lastfm/", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send(JSON.stringify({ method: method, track: trackId }));
  }

  // Show or hide the LastFM icon in the player bar based on the presence of the cookie.
  function showHideLastFMIcon() {
    var el = document.getElementById("player-lastfm");
    if (!el) return;

    var visible = document.cookie
      .split(";")
      .some((c) => c.trim().startsWith("lastfm="));

    el.style.display = visible ? "inline" : "none";
  }

  // --- Display ---

  // Update the play/pause button icon based on the current playback state.
  function updatePlayPauseIcon() {
    var icon = document.querySelector(".btn-playpause span");
    if (!icon) return;

    icon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  }

  // Update the player bar display (artwork, track and album info) based on the current track.
  function updatePlayerDisplay() {
    var hintEl = document.getElementById("player-hint");
    var artEl = document.getElementById("player-art");
    var linkEl = document.getElementById("player-art-link");
    var trackEl = document.getElementById("player-track");
    var albumEl = document.getElementById("player-album");
    var t = playerTracks[index];

    if (hintEl) hintEl.style.display = "none";

    if (linkEl) {
      var albumUrl = `/album/${playerAlbum.id}/`;
      linkEl.style.display = "flex";
      linkEl.href = albumUrl;
    }
    if (artEl) artEl.src = playerAlbum.artUrl || "";
    if (trackEl) trackEl.textContent = t ? t.title : "";
    if (albumEl)
      albumEl.textContent = `${playerAlbum.albumartist} · ${playerAlbum.album}`;
  }

  // Show a marker next to the currently playing track in the page track list, if present.
  function setTrackMarker(oneBasedIdx) {
    document.querySelectorAll('[id^="track-marker-"]').forEach((el) => {
      el.style.display = "none";
    });

    var marker = document.getElementById(`track-marker-${oneBasedIdx}`);
    if (marker) marker.style.display = "";
  }

  // --- Playback ---

  // Load the specified track index into the audio element, update the display and save the state.
  function loadTrack(idx, pos) {
    audio.src = playerTracks[idx].file;
    progressFill.style.width = "0%";
    updatePlayerDisplay();
    if (pageAlbum.id === playerAlbum.id) {
      setTrackMarker(idx + 1);
    }
    saveState(idx, pos || 0);

    if (navigator.mediaSession) {
      var t = playerTracks[idx];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: playerAlbum.albumartist,
        album: playerAlbum.album,
        artwork: playerAlbum.artUrl ? [{ src: playerAlbum.artUrl }] : [],
      });
    }
  }

  // Update the progress bar fill as the track plays.
  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;

    /* biome-ignore lint: Readabillity. */
    progressFill.style.width = (audio.currentTime / audio.duration) * 100 + "%";
  });

  // When the user seeks, update the state with the new position.
  audio.addEventListener("seeked", () => {
    if (playerTracks.length) {
      saveState(index, audio.currentTime);
    }
  });

  // When a track starts playing, update the state and notify LastFM.
  audio.addEventListener("play", () => {
    isPlaying = true;
    updatePlayPauseIcon();

    var heart = document.getElementById("navbar-heart");
    if (heart) heart.classList.add("playing", "fa-beat-fade");

    if (broadcast) broadcast.postMessage({ type: "stop" });
  });

  // When a track is paused, update the state.
  audio.addEventListener("pause", () => {
    isPlaying = false;
    updatePlayPauseIcon();

    if (playerTracks.length) saveState(index, audio.currentTime);

    var heart = document.getElementById("navbar-heart");

    if (heart) heart.classList.remove("playing", "fa-beat-fade");
  });

  // When a track ends, scrobble it to LastFM and load the next track if available.
  audio.addEventListener("ended", () => {
    sendLastFM("scrobble", playerTracks[index].id);

    if (index + 1 < playerTracks.length) {
      loadTrack(++index);
      audio.play().catch((e) => {
        console.warn("Playback failed:", e);
      });
      sendLastFM("now_playing", playerTracks[index].id);
    } else {
      index = 0;
      loadTrack(index);
    }
  });

  // When the user clicks on the progress bar, seek to the corresponding position.
  progressBar.addEventListener("click", (e) => {
    if (!audio.duration) return;

    var rect = progressBar.getBoundingClientRect();

    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // Save position every 10 seconds while playing.
  setInterval(() => {
    if (isPlaying && playerTracks.length) {
      saveState(index, audio.currentTime);
    }
  }, 10000);

  // --- Controls ---

  // Play/pause toggle.
  document
    .querySelector(".btn-playpause")
    .addEventListener("click", function () {
      this.blur();

      if (!playerTracks.length) return;

      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch((e) => {
          console.warn("Playback failed:", e);
        });
        sendLastFM("now_playing", playerTracks[index].id);
      }
    });

  // Next track.
  document.querySelector(".btn-next").addEventListener("click", function () {
    this.blur();

    if (index + 1 < playerTracks.length) {
      loadTrack(++index);

      if (isPlaying) {
        audio.play().catch((e) => {
          console.warn("Playback failed:", e);
        });
        sendLastFM("now_playing", playerTracks[index].id);
      }
    }
  });

  // Previous track.
  document.querySelector(".btn-prev").addEventListener("click", function () {
    this.blur();

    if (index - 1 > -1) {
      loadTrack(--index);

      if (isPlaying) {
        audio.play().catch((e) => {
          console.warn("Playback failed:", e);
        });
        sendLastFM("now_playing", playerTracks[index].id);
      }
    }
  });

  // Navigate via HTMX at click time so the current player href is always used.
  document.getElementById("player-art-link").addEventListener("click", (e) => {
    var href = e.currentTarget.getAttribute("href");
    if (!href || href === "#") return;
    e.preventDefault();
    htmx.ajax("GET", href, {
      target: "#page-content",
      swap: "innerHTML",
      select: "#page-content",
      selectOOB: "#navbar-form",
      push: "true",
    });
  });

  // Eject track from the page track list into the player.
  document.addEventListener("click", (e) => {
    var btn = e.target.closest(".btn-eject");

    if (!btn) return;

    btn.blur();
    playerTracks = pageTracks;
    playerAlbum = pageAlbum;
    index = parseInt(btn.value, 10) - 1;
    loadTrack(index);

    if (isPlaying) {
      audio.play().catch((e) => {
        console.warn("Playback failed:", e);
      });
      sendLastFM("now_playing", playerTracks[index].id);
    }
  });

  // --- Cross-tab sync ---

  // When another tab starts playing, pause this one.
  if (broadcast) {
    broadcast.onmessage = (e) => {
      if (e.data.type === "stop") audio.pause();
    };
  }

  // Register MediaSession action handlers so native controls call our code directly for play/pause/skip.
  if (navigator.mediaSession) {
    navigator.mediaSession.setActionHandler("play", () => {
      audio.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (index > 0) {
        loadTrack(--index);
        if (isPlaying) audio.play().catch(() => {});
      }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (index + 1 < playerTracks.length) {
        loadTrack(++index);
        if (isPlaying) audio.play().catch(() => {});
      }
    });
  }

  // --- Public API ---

  // This function is called by the album page on every load with the current page's track list and album info.
  window.loadAlbum = (tracks, album) => {
    pageTracks = tracks;
    pageAlbum = album;

    var pageArt = document.querySelector("#page-content .card img");
    pageAlbum.artUrl = album.artUrl || (pageArt ? pageArt.src : "");

    showHideLastFMIcon();

    if (playerTracks.length) {
      var currentFile = playerTracks[index].file;
      var matchIdx = -1;
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].file === currentFile) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx >= 0) setTrackMarker(matchIdx + 1);
    }
  };

  // Listen for htmx page load events to update the track marker in the page track list.
  document.body.addEventListener("htmx:afterSettle", (e) => {
    if (e.detail.target.id !== "page-content") return;
    if (!playerTracks.length) return;

    var currentFile = playerTracks[index].file;
    for (var i = 0; i < pageTracks.length; i++) {
      if (pageTracks[i].file === currentFile) {
        setTrackMarker(i + 1);
        return;
      }
    }
    setTrackMarker(0);
  });

  // --- Init ---

  playerBar.style.display = "block";
  document.body.classList.add("player-active");
  showHideLastFMIcon();

  // On page load, try to restore the player state from local storage.
  var saved = readState();

  if (saved) {
    playerTracks = saved.tracks;
    playerAlbum = {
      id: saved.albumId,
      album: saved.album,
      albumartist: saved.albumartist,
      artUrl: saved.artUrl,
    };
    index = saved.index;
    loadTrack(index, saved.position);

    if (saved.position > 0) {
      audio.addEventListener("canplay", function seek() {
        audio.currentTime = saved.position;
        audio.removeEventListener("canplay", seek);
      });
    }
  }

  // On full page load of an album page, load the album data.
  var albumDataEl = document.getElementById("album-data");
  if (albumDataEl) {
    var albumData = JSON.parse(albumDataEl.textContent);
    window.loadAlbum(albumData.tracks, albumData.album);
  }
})();
