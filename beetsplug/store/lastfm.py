# -*- coding: utf-8 -*-

"""Beets store Last FM module for authentication and scrobble."""

from datetime import datetime
import hashlib
from time import time

import flask
import requests


API_ENDPOINT = "http://ws.audioscrobbler.com/2.0/?format=json"
API_AUTH = "https://www.last.fm/api/auth?api_key=%s"


class LastFM:
    def __init__(self, api_key, secret_key, logger):
        self.api_key = api_key
        self.secret_key = secret_key
        self.logger = logger

    def send_request(self, method, session_key=None, parameters={}):
        parameters.update(
            {
                "api_key": self.api_key,
                "method": method,
            }
        )

        if session_key:
            parameters.update({"sk": session_key})

        parameters.update({"api_sig": self.sign_request(parameters)})

        response = requests.post(API_ENDPOINT, parameters)
        now = datetime.now()
        self.logger.info(
            '%s - - [%s] "POST %s" %s -'
            % (
                flask.request.remote_addr,
                now.strftime("%d/%b/%Y %H:%M:%S"),
                "lastfm." + method,
                response.status_code,
            )
        )

        return response

    def sign_request(self, parameters):
        string = ""
        keys = parameters.keys()

        for key in sorted(keys):
            string += key
            string += parameters[key]
        string += self.secret_key

        encoded = string.encode("utf8")

        signature = hashlib.md5(encoded).hexdigest()

        return signature

    def auth_url(self, callback=None):
        url = API_AUTH % self.api_key
        if callback:
            url = url + "&cb=%s" % callback

        return url

    def now_playing(self, song, artist, session_key):
        return self.send_request(
            "track.updateNowPlaying",
            session_key,
            {"artist": artist, "track": song},
        )

    def scrobble(self, song, artist, session_key):
        return self.send_request(
            "track.scrobble",
            session_key,
            {
                "artist": artist,
                "track": song,
                "timestamp": str(int(time()) - 30),
            },
        )

    def session(self, auth_token):
        response = self.send_request(
            "auth.getSession", parameters={"token": auth_token}
        )

        session = response.json()

        return session["session"]["key"]
