# -*- coding: utf-8 -*-

import os
import tempfile
import werkzeug
import time
import zipfile

import beets
from beets.plugins import BeetsPlugin
from beets.ui import Subcommand

import flask
from flask import Flask, Blueprint

from .lastfm import LastFM
from .utils import *


app = Flask(__name__)


@app.template_filter("duration")
def duration_filter(timestamp):
    m, s = divmod(int(timestamp), 60)
    if m < 60:
        return "%d:%02d" % (m, s)

    h, m = divmod(m, 60)
    if h < 24:
        return "%d:%02d:%02d" % (h, m, s)

    d, h = divmod(h, 24)
    return "%d %d:%02d:%02d" % (d, h, m, s)


@app.before_request
def before_request():
    flask.g.lib = app.config["lib"]
    flask.g.zipdir = app.config["zipdir"]
    flask.g.lastfm = app.config["lastfm"]


@app.errorhandler(405)
@app.errorhandler(404)
def page_not_found(e):
    if isinstance(e, werkzeug.exceptions.NotFound):
        if request_is_json():
            error = "Oops! The Page you requested was not found!"
            return flask.jsonify(error=error), 404
        return flask.render_template("http_error.html", error=404), 404
    if isinstance(e, werkzeug.exceptions.MethodNotAllowed):
        if request_is_json():
            error = "Oops! The requested method is not allowed!"
            return flask.jsonify(error=error), 405
        return flask.render_template("http_error.html", error=405), 405


@app.route("/track/<int:track_id>/file")
def get_track_file(track_id):
    track = flask.g.lib.get_item(track_id)
    if not track:
        flask.abort(404)
    path = beets.util.syspath(track.path)
    filename = os.path.basename(path).decode("utf-8")
    response = flask.send_file(
        path.decode("utf-8"), as_attachment=True, attachment_filename=filename
    )
    response.headers["Content-Length"] = os.path.getsize(path)

    return response


@app.route("/tracks/", methods=["GET", "POST"])
def get_tracks():
    query = None
    if flask.request.method == "POST":
        query = u"title::^%s" % (flask.request.form["query"])
    tracks = [
        translate_library(track) for track in flask.g.lib.items(query=query)
    ]
    tracks = sorted(
        tracks,
        key=lambda track: (track["album"], track["disc"], track["track"]),
    )
    if request_is_json():
        return flask.jsonify(tracks=tracks)

    return flask.render_template("tracks.html", tracks=tracks)


@app.route("/artists/", methods=["GET", "POST"])
def get_artists():
    query = None
    if flask.request.method == "POST":
        query = flask.request.form["query"]
    with flask.g.lib.transaction() as tx:
        artists_list = tx.query("SELECT DISTINCT albumartist FROM albums")
    if query:
        artist_list = [
            artist[0]
            for artist in artists_list
            if artist[0].startswith(query)
        ]
    else:
        artist_list = [artist[0] for artist in artists_list]

    artists = []
    for artist in artist_list:
        albums = [
            translate_library(album)
            for album in flask.g.lib.albums(query="albumartist:%s" % (artist))
        ]
        entry = {"artist": artist, "albums": albums}
        artists.append(entry)

    artists = sorted(artists, key=lambda artist: (artist["artist"]))

    if request_is_json():
        return flask.jsonify(artists=artists)

    return flask.render_template("artists.html", artists=artists)


@app.route("/album/<int:album_id>/file")
def get_album_file(album_id):
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)
    tracks = [beets.util.syspath(track.path) for track in album.items()]
    zfile = os.path.join(
        flask.g.zipdir, "%d-%d" % (album.id, int(album.added))
    )

    if os.path.exists(zfile):
        if (int(time.time()) - int(os.stat(zfile).st_ctime)) >= 17280:
            os.remove(zfile)

    if not os.path.exists(zfile):
        with zipfile.ZipFile(zfile, "w", zipfile.ZIP_DEFLATED) as z:
            if album.artpath:
                artpath = beets.util.syspath(album.artpath)
                z.write(artpath, os.path.basename(artpath).decode("utf-8"))
            for track in tracks:
                z.write(
                    track.decode("utf-8"),
                    os.path.basename(track).decode("utf-8"),
                )

    filename = "%s - %s.zip" % (album.albumartist, album.album)

    response = flask.send_file(
        zfile, as_attachment=True, attachment_filename=filename
    )
    response.headers["Content-Length"] = os.path.getsize(zfile)

    return response


@app.route("/album/<int:album_id>/")
def get_album(album_id):
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)
    album = translate_library(album, expand=True)
    if request_is_json():
        return flask.jsonify(album=album)

    return flask.render_template("album.html", album=album)


@app.route("/", methods=["GET", "POST"])
@app.route("/albums/", methods=["GET", "POST"])
def get_albums():
    query = None
    if flask.request.method == "POST":
        query = u"album::^%s" % (flask.request.form["query"])
    albums = [
        translate_library(album) for album in flask.g.lib.albums(query=query)
    ]
    albums = sorted(albums, key=lambda album: (album["album"]))

    if request_is_json():
        return flask.jsonify(albums=albums)

    return flask.render_template("albums.html", albums=albums)


@app.route("/lastfm/", methods=["GET", "POST"])
def lastfm():
    api_key = flask.g.lastfm.get("api_key")
    secret_key = flask.g.lastfm.get("secret_key")

    # ajax call to scrobble
    if flask.request.method == "POST":
        method = flask.request.form.get("method")
        track = flask.request.form.get("track")[7:]
        session = flask.request.cookies.get("lastfm")

        if not session:
            return ""

        item = flask.g.lib.get_item(track)

        lastfm = LastFM(api_key, secret_key, logger=app.logger)
        if method == "now_playing":
            lastfm.now_playing(item.title, item.artist, session)
        elif method == "scrobble":
            lastfm.scrobble(item.title, item.artist, session)

        return ""

    # already access allowed redirect to albums
    if "lastfm" in flask.request.cookies:
        return flask.redirect(flask.url_for("get_albums"))

    # callback from LastFM after user auth
    if "token" in flask.request.args:
        auth_token = flask.request.args.get("token")

        lastfm = LastFM(api_key, secret_key, logger=app.logger)
        session = lastfm.session(auth_token)

        response = flask.make_response(
            flask.redirect(flask.url_for("get_albums"))
        )
        response.set_cookie("lastfm", session, samesite="Strict")

        return response

    # redirect to LastFM for user auth
    lastfm = LastFM(api_key, secret_key, logger=app.logger)
    url = lastfm.auth_url(flask.request.url)

    return flask.redirect(url)


class Store(BeetsPlugin):
    def __init__(self):
        super(Store, self).__init__()
        self.config.add(
            {
                "host": u"",
                "port": 8080,
            }
        )

    def parse_args(self, args):
        args = beets.ui.decargs(args)
        if args:
            self.config["host"] = args.pop(0)
        if args:
            self.config["port"] = int(args.pop(0))

    def app_config(self, lib):
        if "zipdir" in self.config.keys():
            app.config["zipdir"] = self.config["zipdir"].get()
        else:
            app.config["zipdir"] = tempfile.gettempdir()
        app.config["lastfm"] = self.config["lastfm"].get()
        app.config["lib"] = lib

    def app_blueprint(self):
        media = Blueprint(
            "media",
            __name__,
            static_url_path="/media",
            static_folder=beets.config["directory"].get(),
        )
        app.register_blueprint(media)

    def func(self, lib, opts, args):
        self.parse_args(args)
        self.app_config(lib)
        self.app_blueprint()

        app.run(
            host=self.config["host"].get(),
            port=self.config["port"].get(int),
            threaded=True,
        )

    def commands(self):
        cmd = Subcommand("store", help="start the Store web interface")

        cmd.func = self.func
        return [cmd]
