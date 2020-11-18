# -*- coding: utf-8 -*-

import beets
import flask
import os

from logging.config import dictConfig


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


def request_is_json():
    best = flask.request.accept_mimetypes.best_match(
        ["application/json", "text/html"]
    )
    return (
        best == "application/json"
        and flask.request.accept_mimetypes[best]
        > flask.request.accept_mimetypes["text/html"]
    )


def media_url(path):
    rel_path = os.path.relpath(path, beets.config["directory"].get())
    return os.path.join(os.path.sep, "media", rel_path)


def translate_library(obj, expand=False):
    dictionary = dict(obj)

    if isinstance(obj, beets.library.Album):
        if "artpath" not in dictionary:
            dictionary["artpath"] = None

        if dictionary["artpath"] is not None and os.path.exists(
            dictionary["artpath"]
        ):
            dictionary["artpath"] = media_url(
                beets.util.syspath(obj.artpath.decode("utf-8"))
            )
        else:
            dictionary["artpath"] = "holder.js/500x500/gray/auto/text:%s/" % (
                dictionary["album"]
            )

        if expand:
            tracks = [translate_library(track) for track in obj.items()]
            dictionary["tracks"] = sorted(
                tracks, key=lambda track: (track["disc"], track["track"])
            )

    if isinstance(obj, beets.library.Item):
        if request_is_json():
            del dictionary["path"]
        else:
            dictionary["path"] = media_url(
                beets.util.syspath(dictionary["path"].decode("utf-8"))
            )

    return dictionary
