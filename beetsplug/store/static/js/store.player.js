// --- State ---

// Player state.
let playerTracks = [];
let playerAlbum = {};
let playerIndex = 0;
let playerIsPlaying = false;

// Album page state.
let playerPageTracks = [];
let playerPageAlbum = {};

// BroadcastChannel for cross-tab stop-on-play behavior.
const playerBroadcast = window.BroadcastChannel
  ? new BroadcastChannel("beets-store-player")
  : null;

// --- DOM ---

const playerAudio = document.getElementById("audio");
const playerBar = document.getElementById("player-bar");
const playerProgressBar = document.getElementById("player-progress");
const playerProgressFill = document.getElementById("player-progress-fill");

// --- Storage ---

/**
 * Save the current player state to localStorage.
 * @param {number} idx - The current track playerIndex.
 * @param {number} pos - The current playback position in seconds.
 */
function playerSaveState(idx, pos) {
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

/**
 * Read the saved player state from localStorage.
 * @returns {Object|null} The saved state object, or null if not found or invalid.
 */
function playerReadState() {
  try {
    const raw = localStorage.getItem("playerState");
    if (!raw) return null;

    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.tracks) || !s.tracks.length) return null;

    return s;
  } catch (e) {
    console.warn("Failed to read player state:", e);
    return null;
  }
}

// --- LastFM ---

/**
 * Notify the backend of the currently playing track or a scrobble event.
 * @param {string} method - The LastFM method ("now_playing" or "scrobble").
 * @param {string|null} trackId - The track ID to report.
 */
function playerSendLastFM(method, trackId) {
  if (!trackId) return;
  const xhr = new XMLHttpRequest();

  xhr.open("POST", "/lastfm/", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "application/json");
  xhr.send(JSON.stringify({ method: method, track: trackId }));
}

/**
 * Show or hide the LastFM icon in the player bar based on the presence of the session cookie.
 */
function playerShowHideLastFMIcon() {
  const el = document.getElementById("player-lastfm");
  if (!el) return;

  const visible = document.cookie
    .split(";")
    .some((c) => c.trim().startsWith("lastfm="));

  el.style.display = visible ? "inline" : "none";
}

// --- Display ---

/**
 * Update the play/pause button icon based on the current playback state.
 */
function playerUpdatePlayPauseIcon() {
  const icon = document.querySelector(".btn-playpause span");
  if (!icon) return;

  icon.className = playerIsPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
}

/**
 * Update the player bar display (artwork, track title, album info) based on the current track.
 */
function playerUpdateDisplay() {
  const hintEl = document.getElementById("player-hint");
  const artEl = document.getElementById("player-art");
  const linkEl = document.getElementById("player-art-link");
  const trackEl = document.getElementById("player-track");
  const albumEl = document.getElementById("player-album");
  const t = playerTracks[playerIndex];

  if (hintEl) hintEl.style.display = "none";

  if (linkEl) {
    const albumUrl = `/album/${playerAlbum.id}/`;
    linkEl.style.display = "flex";
    linkEl.href = albumUrl;
  }
  if (artEl) artEl.src = playerAlbum.artUrl || "";
  if (trackEl) trackEl.textContent = t ? t.title : "";
  if (albumEl)
    albumEl.textContent = `${playerAlbum.albumartist} · ${playerAlbum.album}`;
}

/**
 * Show a marker next to the currently playing track in the page track list, if present.
 * @param {number} oneBasedIdx - The 1-based track playerIndex to mark, or 0 to hide all markers.
 */
function playerSetTrackMarker(oneBasedIdx) {
  document.querySelectorAll('[id^="track-marker-"]').forEach((el) => {
    el.style.display = "none";
  });

  const marker = document.getElementById(`track-marker-${oneBasedIdx}`);
  if (marker) marker.style.display = "";
}

// --- Playback ---

/**
 * Load the track at the given playerIndex into the playerAudio element, update the display, and save state.
 * @param {number} idx - The playerIndex into playerTracks to load.
 * @param {number} [pos=0] - The playback position in seconds to save as the initial position.
 */
function playerLoadTrack(idx, pos) {
  playerAudio.src = playerTracks[idx].file;
  playerProgressFill.style.width = "0%";
  playerUpdateDisplay();
  if (playerPageAlbum.id === playerAlbum.id) {
    playerSetTrackMarker(idx + 1);
  }
  playerSaveState(idx, pos || 0);

  if (navigator.mediaSession) {
    const t = playerTracks[idx];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: playerAlbum.albumartist,
      album: playerAlbum.album,
      artwork: playerAlbum.artUrl ? [{ src: playerAlbum.artUrl }] : [],
    });
  }
}

// --- Public API ---

/**
 * Called by the album page on every load with the current page's track list and album info.
 * Updates the page track marker if the currently playing track is on this album.
 * @param {Array<{file: string, title: string, id: string}>} tracks - The album's track list.
 * @param {Object} album - The album metadata (id, album, albumartist, artUrl).
 */
export const playerLoadAlbum = (tracks, album) => {
  playerPageTracks = tracks;
  playerPageAlbum = album;

  const pageArt = document.querySelector("#page-content .card img");
  playerPageAlbum.artUrl = album.artUrl || (pageArt ? pageArt.src : "");

  playerShowHideLastFMIcon();

  if (playerTracks.length) {
    const currentFile = playerTracks[playerIndex].file;
    let matchIdx = -1;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].file === currentFile) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) playerSetTrackMarker(matchIdx + 1);
  }
};

// --- Events, controls, and init ---

// Update the progress bar fill as the track plays.
playerAudio.addEventListener("timeupdate", () => {
  if (!playerAudio.duration) return;

  // biome-ignore lint: Readabillity
  playerProgressFill.style.width = (playerAudio.currentTime / playerAudio.duration) * 100 + "%";
});

// When the user seeks, update the state with the new position.
playerAudio.addEventListener("seeked", () => {
  if (playerTracks.length) {
    playerSaveState(playerIndex, playerAudio.currentTime);
  }
});

// When a track starts playing, update the play icon and playerBroadcast stop to other tabs.
playerAudio.addEventListener("play", () => {
  playerIsPlaying = true;
  playerUpdatePlayPauseIcon();

  const heart = document.getElementById("navbar-heart");
  if (heart) heart.classList.add("playing", "fa-beat-fade");

  if (playerBroadcast) playerBroadcast.postMessage({ type: "stop" });
});

// When a track is paused, update the play icon and save position.
playerAudio.addEventListener("pause", () => {
  playerIsPlaying = false;
  playerUpdatePlayPauseIcon();

  if (playerTracks.length) playerSaveState(playerIndex, playerAudio.currentTime);

  const heart = document.getElementById("navbar-heart");
  if (heart) heart.classList.remove("playing", "fa-beat-fade");
});

// When a track ends, scrobble it to LastFM and advance to the next track.
playerAudio.addEventListener("ended", () => {
  playerSendLastFM("scrobble", playerTracks[playerIndex].id);

  if (playerIndex + 1 < playerTracks.length) {
    playerLoadTrack(++playerIndex);
    playerAudio.play().catch((e) => {
      console.warn("Playback failed:", e);
    });
    playerSendLastFM("now_playing", playerTracks[playerIndex].id);
  } else {
    playerIndex = 0;
    playerLoadTrack(playerIndex);
  }
});

// When the user clicks the progress bar, seek to the corresponding position.
playerProgressBar.addEventListener("click", (e) => {
  if (!playerAudio.duration) return;

  const rect = playerProgressBar.getBoundingClientRect();
  playerAudio.currentTime = ((e.clientX - rect.left) / rect.width) * playerAudio.duration;
});

// Save position every 10 seconds while playing.
setInterval(() => {
  if (playerIsPlaying && playerTracks.length) {
    playerSaveState(playerIndex, playerAudio.currentTime);
  }
}, 10000);

// --- Controls ---

// Play/pause toggle.
document
  .querySelector(".btn-playpause")
  .addEventListener("click", function () {
    this.blur();

    if (!playerTracks.length) return;

    if (playerIsPlaying) {
      playerAudio.pause();
    } else {
      playerAudio.play().catch((e) => {
        console.warn("Playback failed:", e);
      });
      playerSendLastFM("now_playing", playerTracks[playerIndex].id);
    }
  });

// Next track.
document.querySelector(".btn-next").addEventListener("click", function () {
  this.blur();

  if (playerIndex + 1 < playerTracks.length) {
    playerLoadTrack(++playerIndex);

    if (playerIsPlaying) {
      playerAudio.play().catch((e) => {
        console.warn("Playback failed:", e);
      });
      playerSendLastFM("now_playing", playerTracks[playerIndex].id);
    }
  }
});

// Previous track.
document.querySelector(".btn-prev").addEventListener("click", function () {
  this.blur();

  if (playerIndex - 1 > -1) {
    playerLoadTrack(--playerIndex);

    if (playerIsPlaying) {
      playerAudio.play().catch((e) => {
        console.warn("Playback failed:", e);
      });
      playerSendLastFM("now_playing", playerTracks[playerIndex].id);
    }
  }
});

// Navigate via HTMX at click time so the current player href is always used.
document.getElementById("player-art-link").addEventListener("click", (e) => {
  const href = e.currentTarget.getAttribute("href");
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

// Load a track from the page track list into the player.
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-eject");

  if (!btn) return;

  btn.blur();
  playerTracks = playerPageTracks;
  playerAlbum = playerPageAlbum;
  playerIndex = parseInt(btn.value, 10) - 1;
  playerLoadTrack(playerIndex);

  if (playerIsPlaying) {
    playerAudio.play().catch((e) => {
      console.warn("Playback failed:", e);
    });
    playerSendLastFM("now_playing", playerTracks[playerIndex].id);
  }
});

// --- Cross-tab sync ---

// When another tab starts playing, pause this one.
if (playerBroadcast) {
  playerBroadcast.onmessage = (e) => {
    if (e.data.type === "stop") playerAudio.pause();
  };
}

// Register MediaSession action handlers so native controls work for play/pause/skip.
if (navigator.mediaSession) {
  navigator.mediaSession.setActionHandler("play", () => {
    playerAudio.play().catch(() => {});
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    playerAudio.pause();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    if (playerIndex > 0) {
      playerLoadTrack(--playerIndex);
      if (playerIsPlaying) playerAudio.play().catch(() => {});
    }
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    if (playerIndex + 1 < playerTracks.length) {
      playerLoadTrack(++playerIndex);
      if (playerIsPlaying) playerAudio.play().catch(() => {});
    }
  });
}

// --- Init ---

playerBar.style.display = "block";
document.body.classList.add("player-active");
playerShowHideLastFMIcon();

// On page load, try to restore the player state from localStorage.
const saved = playerReadState();

if (saved) {
  playerTracks = saved.tracks;
  playerAlbum = {
    id: saved.albumId,
    album: saved.album,
    albumartist: saved.albumartist,
    artUrl: saved.artUrl,
  };
  playerIndex = saved.index;
  playerLoadTrack(playerIndex, saved.position);

  if (saved.position > 0) {
    playerAudio.addEventListener("canplay", function seek() {
      playerAudio.currentTime = saved.position;
      playerAudio.removeEventListener("canplay", seek);
    });
  }
}

// On full page load of an album page, load the album data.
const albumDataEl = document.getElementById("album-data");
if (albumDataEl) {
  const albumData = JSON.parse(albumDataEl.textContent);
  playerLoadAlbum(albumData.tracks, albumData.album);
}

// Listen for HTMX page swaps to update the track marker in the page track list.
document.body.addEventListener("htmx:afterSettle", (e) => {
  if (e.detail.target.id !== "page-content") return;
  if (!playerTracks.length) return;

  const currentFile = playerTracks[playerIndex].file;
  for (let i = 0; i < playerPageTracks.length; i++) {
    if (playerPageTracks[i].file === currentFile) {
      playerSetTrackMarker(i + 1);
      return;
    }
  }
  playerSetTrackMarker(0);
});

