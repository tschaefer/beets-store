# -*- coding: utf-8 -*-

"""Flask app to run the beets store web server."""

import beets
import flask
import os
import tempfile
import time
import werkzeug

from flask import Flask, Blueprint

from .lastfm import LastFM
from .utils import request_is_json, decode, media_url
from .tasks import Task


app = Flask(__name__)
task = Task()


@app.template_filter("duration")
def duration_filter(timestamp):
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
    flask.g.lib = app.config['lib']
    flask.g.zipdir = app.config['zipdir']
    flask.g.lastfm = app.config.get('lastfm', None)


@app.errorhandler(405)
@app.errorhandler(404)
def page_not_found(e):
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


@app.context_processor
def inject_lastfm():
    lastfm = True if flask.g.lastfm else False
    return dict(lastfm=lastfm)


@app.after_request
def force_content_disposition(response):
    kind = response.headers.get("Content-Type")
    if not kind:
        return response

    if kind not in ["image/jpeg", "image/png", "audio/mpeg"]:
        return response

    disposition = response.headers["Content-Disposition"]
    if not disposition:
        return response

    response.headers["Content-Disposition"] = disposition.replace(
        "inline", "attachment"
    )

    return response


@app.route("/tracks/", methods=["GET", "POST"])
def get_tracks():
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        q = "WHERE title LIKE '%s%%'" % (query) if query else ""
        sql = "SELECT * FROM items %s" % (q)
        sql += " ORDER BY album, disc, track"
        tracks = transaction.query(sql)

    if not tracks:
        flask.abort(404)

    tracks = [decode(track, 'track') for track in tracks]

    if request_is_json():
        return flask.jsonify(tracks=tracks)

    return flask.render_template("tracks.html", tracks=tracks)


@app.route("/artists/", methods=["GET", "POST"])
def get_artists():
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        q = "WHERE albumartist LIKE '%s%%'" % (query) if query else ""
        sql = "SELECT DISTINCT albumartist FROM albums %s" % (q)
        sql += " ORDER BY albumartist"
        artists_list = transaction.query(sql)

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
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)

    with flask.g.lib.transaction() as transaction:
        sql = "SELECT * FROM items WHERE album_id=%d" % (album_id)
        sql += " ORDER BY disc, track"
        tracks = transaction.query(sql)

    album = decode(album, 'album')
    tracks = [decode(track, 'track') for track in tracks]
    album["tracks"] = tracks

    if request_is_json():
        return flask.jsonify(album=album)

    return flask.render_template("album.html", album=album)


@app.route("/", methods=["GET", "POST"])
@app.route("/albums/", methods=["GET", "POST"])
def get_albums():
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]

    with flask.g.lib.transaction() as transaction:
        q = "WHERE album LIKE '%s%%'" % (query) if query else ""
        sql = "SELECT * FROM albums %s" % (q)
        sql += " ORDER BY album"
        albums = transaction.query(sql)

    albums = [decode(album, 'album') for album in albums]

    if request_is_json():
        return flask.jsonify(albums=albums)

    return flask.render_template("albums.html", albums=albums)


@app.route("/lastfm/", methods=["GET", "POST"])
def lastfm():
    if not flask.g.lastfm:
        return ('', 204)

    api_key = flask.g.lastfm.get("api_key")
    secret_key = flask.g.lastfm.get("secret_key")

    last_fm = LastFM(api_key, secret_key, app.logger)

    # ajax call to scrobble
    if flask.request.method == "POST":
        data = flask.request.get_json()
        method = data.get("method")
        track = data.get("track").replace("#track-", "")
        session = flask.request.cookies.get("lastfm")

        print(method, track, session)

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

        response = flask.make_response(
            flask.redirect(flask.url_for("get_albums"))
        )
        response.set_cookie("lastfm", session, samesite="Strict")

        return response

    # redirect to LastFM for user auth
    url = last_fm.auth_url(flask.request.url)

    return flask.redirect(url)


class App():
    def __init__(self, config, lib, media):
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

        media = Blueprint(
            "media",
            __name__,
            static_url_path="/media",
            static_folder=media,
        )
        app.register_blueprint(media)

    def run(self):
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
            debug=os.environ.get('FLASK_DEBUG', False),
            ssl_context=ssl_context,
        )
