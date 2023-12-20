function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function checkCookie() {
  var lastfm = getCookie("lastfm");
  if (lastfm != "") {
    document.getElementById("lastfm").style.display = "initial";
  }
  else {
    document.getElementById("lastfm").style.display = "none";
  }
}

checkCookie();


class LastFM {
  constructor(track_id) {
    this.track_id = track_id
  }

  _sendRequest(method ) {
    let data = { method: method, track: this.track_id };
    let json = JSON.stringify(data);

    let xhr = new XMLHttpRequest();
    xhr.open("POST", "/lastfm/", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");

    return xhr.send(json);
  }

  scrobble() {
    return this._sendRequest('scrobble');
  }

  nowPlaying() {
    return this._sendRequest('now_playing');
  }
}

var lastfm = new LastFM(0);
var audio = $("#audio").get(0);
var index = 0;
var track_num = tracks.length;
var is_playing = false;

var loadTrack = function(last_idx, idx) {
  audio.src = tracks[idx].file;
  if (last_idx != idx) {
    $(tracks[last_idx].id).removeClass("fa fa-circle-o-notch fa-spin");
  }
  $(tracks[idx].id).addClass("fa fa-circle-o-notch");
  if (is_playing == true) {
    $(tracks[idx].id).addClass("fa-spin");
  }
}

var onEnded = function() {
  lastfm.track_id = tracks[index].id;
  lastfm.scrobble()

  if((index + 1) < track_num) {
    loadTrack(index, ++index);
    audio.play();

    lastfm.track_id = tracks[index].id;
    lastfm.nowPlaying()
  } else {
    audio.pause();
    is_playing = false;
    $(".btn-play").removeClass("active");
    var last_idx = index;
    index = 0;
    loadTrack(last_idx, index);
  }
}

loadTrack(index, index);
audio.addEventListener('ended', onEnded);

$(".btn-pause").on("click", function() {
  if (is_playing == false) {
    return;
  }
  $(".btn-pause").blur();
  $(".btn-pause").addClass("active");
  $(".btn-play").removeClass("active");
  audio.pause();
  is_playing = false;
  $(tracks[index].id).removeClass("fa-spin");
});

$(".btn-play").on("click", function() {
  if (is_playing == true) {
    return;
  }
  $(".btn-play").blur();
  $(".btn-play").addClass("active");
  $(".btn-pause").removeClass("active");
  audio.play();
  is_playing = true;
  $(tracks[index].id).addClass("fa-spin");

  lastfm.track_id = tracks[index].id;
  lastfm.nowPlaying();
});

$(".btn-next").on("click", function() {
  $(".btn-next").blur();
  if ((index + 1) < track_num) {
    loadTrack(index, ++index);
    if (is_playing == true) {
      audio.play();

      lastfm.track_id = tracks[index].id;
      lastfm.nowPlaying();
    }
  }
});

$(".btn-prev").on("click", function() {
  $(".btn-prev").blur();
  if ((index - 1) > -1) {
    loadTrack(index, --index);
    if (is_playing == true) {
      audio.play();

      lastfm.track_id = tracks[index].id;
      lastfm.nowPlaying();
    }
  }
});

$(".btn-eject").on("click", function() {
  this.blur();
  loadTrack(index, index=(this.value - 1));
  if (is_playing == true) {
    audio.play();

    lastfm.track_id = tracks[index].id;
    lastfm.nowPlaying();
  }
});

$(".btn-backward").on("click", function() {
  this.blur();
  if (is_playing == false) {
    return;
  }
  audio.currentTime = audio.currentTime - 5;
});

$(".btn-forward").on("click", function() {
  this.blur();
  if (is_playing == false) {
    return;
  }
  audio.currentTime = audio.currentTime + 5;
});

$("#btn-get-album").on("click", function() {
  let xhr = new XMLHttpRequest();
  xhr.open("GET", `/album/${album.id}/file`, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "application/json");

  xhr.onload = function() {
    if (xhr.status == 200) {
      $("#alert-download").addClass("alert-hide");

      let data = JSON.parse(xhr.responseText);
      let link = document.createElement('a');
      link.href = data.url;

      link.click();
    }
    else if (xhr.status == 204) {
      $("#alert-download").removeClass("alert-hide");
    }
  };

  return xhr.send();
});

$("#alert-close").on("click", function() {
  $("#alert-download").addClass("alert-hide");
});

