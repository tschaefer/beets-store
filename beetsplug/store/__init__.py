# -*- coding: utf-8 -*-

import os
import uuid
import operator
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED
from operator import itemgetter

import werkzeug

import beets
from beets.plugins import BeetsPlugin
from beets.ui import Subcommand

import flask
from flask import Flask, Blueprint


media = Blueprint('media',
                  __name__,
                  static_url_path='/media',
                  static_folder=beets.config['directory'].get(unicode))
app = Flask(__name__)
app.register_blueprint(media)


def request_json():
    best = flask.request.accept_mimetypes \
        .best_match(['application/json', 'text/html'])
    return best == 'application/json' and \
        flask.request.accept_mimetypes[best] > \
        flask.request.accept_mimetypes['text/html']


def media_url(path):
    rel_path = os.path.relpath(path, beets.config['directory'].get(unicode))
    return os.path.join(os.path.sep, 'media', rel_path)


def obj_to_dict(obj, expand=False):
    out = dict(obj)
    # remove empty values
    # out = {k: v for k, v in out.items() if v}

    if isinstance(obj, beets.library.Album):
        if 'artpath' not in out:
            out['artpath'] = None

        if out['artpath'] is not None and os.path.exists(out['artpath']):
            out['artpath'] = media_url(
                beets.util.syspath(obj.artpath.decode('utf-8')))
        else:
            out['artpath'] = 'holder.js/500x500/gray/auto/text:%s/' \
                    % (out['album'])
        if expand:
            tracks = [obj_to_dict(track) for track in obj.items()]
            out['tracks'] = sorted(tracks, key=itemgetter('track'))

    if isinstance(obj, beets.library.Item):
        if request_json():
            del out['path']
        else:
            out['path'] = media_url(
                beets.util.syspath(out['path'].decode('utf-8')))

    return out


@app.template_filter('duration')
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
    flask.g.lib = app.config['lib']
    if 'zipdir' in app.config.keys():
        flask.g.zipdir = unicode(app.config['zipdir'])
    else:
        flask.g.zipdir = unicode(tempfile.gettempdir())


@app.errorhandler(405)
@app.errorhandler(404)
def page_not_found(e):
    if isinstance(e, werkzeug.exceptions.NotFound):
        if request_json():
            error = "Oops! The Page you requested was not found!"
            return flask.jsonify(error=error), 404
        return flask.render_template('http_error.html', error=404), 404
    if isinstance(e, werkzeug.exceptions.MethodNotAllowed):
        if request_json():
            error = "Oops! The requested method is not allowed!"
            return flask.jsonify(error=error), 405
        return flask.render_template('http_error.html', error=405), 405


@app.route('/track/<int:track_id>/file')
def get_track_file(track_id):
    track = flask.g.lib.get_item(track_id)
    if not track:
        flask.abort(404)
    path = beets.util.syspath(track.path)
    filename = os.path.basename(path)
    response = flask.send_file(path, as_attachment=True,
                               attachment_filename=filename)
    response.headers['Content-Length'] = os.path.getsize(path)

    return response


@app.route('/tracks/', methods=['GET', 'POST'])
def get_tracks():
    query = None
    if flask.request.method == 'POST':
        query = u"title::^%s" % (unicode(flask.request.form['query']))
    tracks = [obj_to_dict(track) for track in flask.g.lib.items(query=query)]
    if request_json():
        return flask.jsonify(tracks=tracks)

    return flask.render_template('tracks.html', tracks=tracks)


@app.route('/artists/', methods=['GET', 'POST'])
def get_artists():
    query = None
    if flask.request.method == 'POST':
        query = unicode(flask.request.form['query'])
    with flask.g.lib.transaction() as tx:
        artists_list = tx.query("SELECT DISTINCT albumartist FROM albums")
    if query:
        artist_list = [artist[0] for artist in artists_list
                       if artist[0].startswith(query)]
    else:
        artist_list = [artist[0] for artist in artists_list]

    artists = []
    for artist in artist_list:
        albums = [obj_to_dict(album) for album in flask.g.lib.albums(
                  query="albumartist:%s" % (artist))]
        entry = {
            'artist': artist,
            'albums': albums
        }
        artists.append(entry)

    artists = sorted(artists, key=operator.itemgetter('artist'))

    if request_json():
        return flask.jsonify(artists=artists)

    return flask.render_template('artists.html', artists=artists)


@app.route('/album/<int:album_id>/file')
def get_album_file(album_id):
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)
    tracks = [beets.util.syspath(track.path) for track in album.items()]
    zfile = os.path.join(unicode(flask.g.zipdir), unicode(uuid.uuid4()))

    @flask.after_this_request
    def cleanup(response):
        os.remove(zfile)
        return response

    with ZipFile(zfile, 'w', ZIP_DEFLATED) as z:
        if album.artpath:
            artpath = beets.util.syspath(album.artpath.decode('utf-8'))
            z.write(artpath, os.path.basename(artpath))
        for track in tracks:
            z.write(track, os.path.basename(track))
    filename = "%s - %s.zip" % (album.albumartist.encode('utf-8'),
                                album.album.encode('utf-8'))
    response = flask.send_file(zfile, as_attachment=True,
                               attachment_filename=filename)
    response.headers['Content-Length'] = os.path.getsize(zfile)

    return response


@app.route('/album/<int:album_id>/')
def get_album(album_id):
    album = flask.g.lib.get_album(album_id)
    if not album:
        flask.abort(404)
    album = obj_to_dict(album, expand=True)
    if request_json():
        return flask.jsonify(album=album)

    return flask.render_template('album.html', album=album)


@app.route('/', methods=['GET', 'POST'])
@app.route('/albums/', methods=['GET', 'POST'])
def get_albums():
    query = None
    if flask.request.method == 'POST':
        query = u"album::^%s" % (unicode(flask.request.form['query']))
    albums = [obj_to_dict(album) for album in flask.g.lib.albums(query=query)]
    albums = sorted(albums, key=operator.itemgetter('album'))
    if request_json():
        return flask.jsonify(albums=albums)

    return flask.render_template('albums.html', albums=albums)


class Store(BeetsPlugin):
    def __init__(self):
        super(Store, self).__init__()
        self.config.add({
            'host': u'',
            'port': 8080,
        })

    def commands(self):
        cmd = Subcommand('store', help='start the Store web interface')

        def func(lib, opts, args):
            args = beets.ui.decargs(args)
            if args:
                self.config['host'] = args.pop(0)
            if args:
                self.config['port'] = int(args.pop(0))

            if 'zipdir' in self.config.keys():
                app.config['zipdir'] = self.config['zipdir'].get(unicode)
            app.config['lib'] = lib
            app.run(host=self.config['host'].get(unicode),
                    port=self.config['port'].get(int),
                    debug=True, threaded=True)

        cmd.func = func
        return [cmd]
