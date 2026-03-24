# -*- coding: utf-8 -*-

"""Utils module with helper methods for the beets store."""

import os
import base64
import beets
import flask

from logging.config import dictConfig

"""Logging configuration."""
dictConfig({
    'version': 1,
    'formatters': {'default': {
        'format': '%(message)s',
    }},
    'handlers': {'wsgi': {
        'class': 'logging.StreamHandler',
        'stream': 'ext://flask.logging.wsgi_errors_stream',
        'formatter': 'default'
    }},
    'root': {
        'level': 'INFO',
        'handlers': ['wsgi']
    }
})

if os.environ.get('FLASK_DEBUG', '').lower() in ('true', '1', 'yes'):
    beets.config['log']['debug'] = True


def _to_str(value):
    """Convert bytes to string if necessary."""
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def request_is_json():
    """Determine if the request prefers JSON over HTML."""
    best = flask.request.accept_mimetypes.best_match(
        ["application/json", "text/html"]
    )
    return (
        best == "application/json" and flask.request.accept_mimetypes[best]
        > flask.request.accept_mimetypes["text/html"]
    )


def decode(obj, kind='album'):
    """Decode bytes to strings in the given object."""
    dic = dict(obj)

    if kind == 'album':
        if "artpath" not in dic:
            dic["artpath"] = None
            return dic

        artpath = _to_str(dic["artpath"]) if dic["artpath"] else None
        if artpath and os.path.exists(artpath):
            dic["artpath"] = media_url(beets.util.syspath(artpath))
        else:
            if request_is_json():
                del dic["artpath"]
            else:
                title = _to_str(dic["album"]).replace('&', '&amp;').replace('<', '&lt;').replace('"', '&quot;')
                svg = (
                    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">'
                    '<rect width="500" height="500" fill="#343a40"/>'
                    '<text x="250" y="250" text-anchor="middle" dominant-baseline="middle"'
                    ' fill="#6c757d" font-family="sans-serif" font-size="22">%s</text>'
                    '</svg>' % title
                )
                dic["artpath"] = 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()

        return dic

    if kind == 'track':
        if 'artpath' in dic:
            del dic['artpath']

        dic["path"] = media_url(
            beets.util.syspath(_to_str(dic["path"]))
        )

        return dic

    return {}


def media_url(path):
    """Convert a filesystem path to a URL relative to the media directory."""
    media_dir = flask.current_app.config["media"]
    rel_path = os.path.relpath(path, media_dir)
    return os.path.join(os.path.sep, "media", rel_path)
