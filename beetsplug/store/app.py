# -*- coding: utf-8 -*-

"""Flask app to run the beets store web server."""

import beets
import flask
import os
import tempfile
import time
import werkzeug

from flask import Flask, Blueprint
from importlib.metadata import version as pkg_version

from .lastfm import LastFM
from .utils import request_is_json, decode, media_url
from .tasks import Task


app = Flask(__name__)
task = Task()


@app.template_filter("duration")
def duration_filter(timestamp):
    """Convert a timestamp in seconds to a human-readable format."""
    minutes, seconds = divmod(int(timestamp), 60)
    if minutes < 60:
        return "%d:%02d" % (minutes, seconds)

    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        return "%d:%02d:%02d" % (hours, minutes, seconds)

    days, hours = divmod(hours, 24)
    return "%d %d:%02d:%02d" % (days, hours, minutes, seconds)


@app.before_request
def before_request():
    """Set up the database connection and other global variables."""
    flask.g.lib = app.config['lib']
    flask.g.zipdir = app.config['zipdir']
    flask.g.lastfm = app.config.get('lastfm', None)


@app.errorhandler(405)
@app.errorhandler(404)
def page_not_found(e):
    """Handle 404 and 405 errors with custom messages."""
    if isinstance(e, werkzeug.exceptions.NotFound):
        if not request_is_json():
            return flask.render_template("http_error.html", error=404), 404

        error = "I Want That Mulan McNugget Sauce, Morty!"
        return flask.jsonify(error=error), 404

    if isinstance(e, werkzeug.exceptions.MethodNotAllowed):
        if not request_is_json():
            return flask.render_template("http_error.html", error=405), 405

        error = "Sometimes Science Is More Art Than Science."
        return flask.jsonify(error=error), 405

    if isinstance(e, werkzeug.exceptions.BadRequest):
        if not request_is_json():
            return flask.render_template("http_error.html", error=400), 400

        error = "Wubba Lubba Dub Dub!"
        return flask.jsonify(error=error), 400


@app.context_processor
def inject_lastfm():
    """Inject the lastfm variable into the template context."""
    lastfm = True if flask.g.lastfm else False
    return dict(lastfm=lastfm)


@app.after_request
def set_media_headers(response):
    """Set appropriate headers for media files."""
    kind = response.headers.get("Content-Type")
    if not kind:
        return response

    if kind in ["image/jpeg", "image/png"]:
        response.headers["Cache-Control"] = "max-age=31536000, private"
        return response

    if kind == "audio/mpeg":
        disposition = response.headers.get("Content-Disposition")
        if disposition:
            response.headers["Content-Disposition"] = disposition.replace(
                "inline", "attachment"
            )
        response.headers["Cache-Control"] = "max-age=31536000, private"

    return response


@app.route("/tracks/", methods=["GET", "POST"])
def get_tracks():
    """Get a list of tracks, optionally filtered by a search query."""
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        if query:
            sql = "SELECT * FROM items WHERE title LIKE ? ORDER BY album, disc, track"
            tracks = transaction.query(sql, ("%" + query + "%",))
        else:
            tracks = transaction.query("SELECT * FROM items ORDER BY album, disc, track")

    if not tracks:
        flask.abort(404)

    tracks = [decode(track, 'track') for track in tracks]

    if request_is_json():
        return flask.jsonify(tracks=tracks)

    return flask.render_template("tracks.html", tracks=tracks)


@app.route("/artists/", methods=["GET", "POST"])
def get_artists():
    """Get a list of artists, optionally filtered by a search query."""
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        if query:
            sql = "SELECT DISTINCT albumartist FROM albums WHERE albumartist LIKE ? ORDER BY albumartist"
            artists_list = transaction.query(sql, ("%" + query + "%",))
        else:
            artists_list = transaction.query("SELECT DISTINCT albumartist FROM albums ORDER BY albumartist")

        artist_list = [artist[0] for artist in artists_list]

    artists = []
    for artist in artist_list:
        albums = [
            decode(album, 'album')
            for album in flask.g.lib.albums(query="albumartist:%s" % (artist))
        ]
        entry = {"artist": artist, "albums": albums}
        artists.append(entry)

    if not artists:
        flask.abort(404)

    if request_is_json():
        return flask.jsonify(artists=artists)

    return flask.render_template("artists.html", artists=artists)


@app.route("/album/<int:album_id>/file")
def get_album_file(album_id):
    """Get a zip file containing the tracks of the specified album."""
    if not request_is_json():
        flask.abort(405)

    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)

    zfile = os.path.join(
        flask.g.zipdir, "%d-%d.zip" % (album.id, int(album.added))
    )

    if not os.path.exists(zfile) or (int(time.time())
                                     - int(os.stat(zfile).st_ctime) >= 17280):
        files = [beets.util.syspath(track.path) for track in album.items()]
        if album.artpath:
            artpath = beets.util.syspath(album.artpath)
            files.append(artpath)
        task.run('bundle', {'zfile': zfile, 'files': files})

        return ('', 204)

    return flask.jsonify(url=media_url(zfile))


@app.route("/album/<int:album_id>/")
def get_album(album_id):
    """Get the details of a specific album, including its tracks."""
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)

    with flask.g.lib.transaction() as transaction:
        sql = "SELECT * FROM items WHERE album_id=? ORDER BY disc, track"
        tracks = transaction.query(sql, (album_id,))

    album = decode(album, 'album')
    tracks = [decode(track, 'track') for track in tracks]
    album["tracks"] = tracks

    if request_is_json():
        return flask.jsonify(album=album)

    return flask.render_template("album.html", album=album)


@app.route("/", methods=["GET", "POST"])
@app.route("/albums/", methods=["GET", "POST"])
def get_albums():
    """Get a list of albums, optionally filtered by a search query."""
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        if query:
            sql = "SELECT * FROM albums WHERE album LIKE ? ORDER BY album"
            albums = transaction.query(sql, ("%" + query + "%",))
        else:
            albums = transaction.query("SELECT * FROM albums ORDER BY album")

    albums = [decode(album, 'album') for album in albums]

    if request_is_json():
        return flask.jsonify(albums=albums)

    return flask.render_template("albums.html", albums=albums)


@app.route("/lastfm/", methods=["GET", "POST"])
def lastfm():
    """Handle LastFM authentication and scrobbling."""
    if not flask.g.lastfm:
        return ('', 204)

    api_key = flask.g.lastfm.get("api_key")
    secret_key = flask.g.lastfm.get("secret_key")

    last_fm = LastFM(api_key, secret_key, app.logger)

    # ajax call to scrobble
    if flask.request.method == "POST":
        data = flask.request.get_json() or {}
        method = data.get("method")
        track = data.get("track")
        if not isinstance(track, str):
            return flask.jsonify(error="Invalid track parameter"), 400
        track = track.replace("#track-", "")
        session = flask.request.cookies.get("lastfm")

        app.logger.debug("LastFM request: method=%s track=%s session=%s", method, track, bool(session))

        if not session:
            return ""

        item = flask.g.lib.get_item(track)

        if method == "now_playing":
            last_fm.now_playing(item.title, item.artist, session)
        elif method == "scrobble":
            last_fm.scrobble(item.title, item.artist, session)

        return ""

    # already access allowed redirect to LastFM
    if "lastfm" in flask.request.cookies:
        return flask.redirect('https://www.last.fm/')

    # callback from LastFM after user auth
    if "token" in flask.request.args:
        auth_token = flask.request.args.get("token")

        session = last_fm.session(auth_token)
        if not session:
            flask.abort(400)

        response = flask.make_response(
            flask.redirect(flask.url_for("get_albums"))
        )
        response.set_cookie("lastfm", session, samesite="Strict")

        return response

    # redirect to LastFM for user auth
    url = last_fm.auth_url(flask.request.url)

    return flask.redirect(url)


class App():
    """Class to encapsulate the Flask app and its configuration."""
    def __init__(self, config, lib, media):
        """Initialize the app with the given configuration, library, and media
        directory."""
        self.config = config
        self.lib = lib
        self.app = app
        self.task = task

        if "zipdir" in self.config.keys():
            self.app.config["zipdir"] = self.config["zipdir"].get()
        else:
            self.app.config["zipdir"] = tempfile.gettempdir()

        if 'lastfm' in self.config.keys():
            self.app.config["lastfm"] = self.config["lastfm"].get()

        self.app.config["lib"] = self.lib
        self.app.config["media"] = media
        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000

        try:
            _sv = pkg_version("beets-store")
        except Exception:
            _sv = "0"
        self.app.jinja_env.globals["sv"] = _sv

        media = Blueprint(
            "media",
            __name__,
            static_url_path="/media",
            static_folder=self.app.config["media"],
        )
        app.register_blueprint(media)

    def run(self):
        """Run the Flask app with the configured host, port, and SSL
        context."""
        if os.environ.get('FLASK_SSL_CONTEXT'):
            ssl_dir = os.environ.get('FLASK_SSL_CONTEXT')
            ssl_context = (os.path.join(ssl_dir, 'cert.pem'),
                           os.path.join(ssl_dir, 'key.pem'))
        else:
            ssl_context = None

        self.app.run(
            host=self.config["host"].get(),
            port=self.config["port"].get(int),
            threaded=True,
            debug=os.environ.get('FLASK_DEBUG', '').lower() in ('true', '1', 'yes'),
            ssl_context=ssl_context,
        )
