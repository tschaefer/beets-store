# -*- coding: utf-8 -*-

"""Utils module with helper methods for the beets store."""

import os
import beets
import flask

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
        best == "application/json" and flask.request.accept_mimetypes[best]
        > flask.request.accept_mimetypes["text/html"]
    )


def decode(obj, kind='album'):
    dic = dict(obj)

    if kind == 'album':
        if "artpath" not in dic:
            dic["artpath"] = None
            return dic

        if os.path.exists(dic["artpath"]):
            dic["artpath"] = media_url(
                beets.util.syspath(dic["artpath"].decode("utf-8"))
            )
        else:
            if request_is_json():
                del dic["artpath"]
            else:
                dic["artpath"] = "holder.js/500x500/gray/auto/text:%s/" % (
                    dic["album"]
                )

        return dic

    if kind == 'track':
        if 'artpath' in dic:
            del dic['artpath']

        dic["path"] = media_url(
            beets.util.syspath(dic["path"].decode("utf-8"))
        )

        return dic

    return {}


def media_url(path):
    rel_path = os.path.relpath(path, beets.config["directory"].get())
    return os.path.join(os.path.sep, "media", rel_path)
