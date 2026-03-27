# -*- coding: utf-8 -*-

"""Beets store Last FM module for authentication and scrobble."""

from datetime import datetime
import hashlib
from time import time

import flask
import requests


API_ENDPOINT = "https://ws.audioscrobbler.com/2.0/?format=json"
API_AUTH = "https://www.last.fm/api/auth?api_key=%s"


class LastFM:
    """Last FM API client for authentication and scrobbling."""

    def __init__(self, api_key, secret_key, logger):
        """Initialize the LastFM client with API credentials and a logger."""
        self.api_key = api_key
        self.secret_key = secret_key
        self.logger = logger

    def send_request(self, method, session_key=None, parameters={}):
        """Send a request to the Last FM API with the given method and
        parameters."""
        parameters.update(
            {
                "api_key": self.api_key,
                "method": method,
            }
        )

        if session_key:
            parameters.update({"sk": session_key})

        parameters.update({"api_sig": self.__sign_request(parameters)})

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

    def auth_url(self, callback=None):
        """Generate the URL for Last FM authentication, optionally with a
        callback."""
        url = API_AUTH % self.api_key
        if callback:
            url = url + "&cb=%s" % callback

        return url

    def now_playing(self, song, artist, session_key):
        """Update the currently playing track on Last FM."""
        return self.send_request(
            "track.updateNowPlaying",
            session_key,
            {"artist": artist, "track": song},
        )

    def scrobble(self, song, artist, session_key):
        """Scrobble a track to Last FM with a timestamp of 30 seconds ago to
        ensure it counts as a valid scrobble."""
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
        """Exchange an authentication token for a session key."""
        try:
            response = self.send_request(
                "auth.getSession", parameters={"token": auth_token}
            )
            response.raise_for_status()
            data = response.json()

            return data["session"]["key"]
        except (requests.RequestException, ValueError, KeyError) as e:
            self.logger.error("LastFM auth.getSession failed: %s", e)
            return None

    def __sign_request(self, parameters):
        """Generate an API signature for the given parameters."""
        string = ""
        keys = parameters.keys()

        for key in sorted(keys):
            string += key
            string += str(parameters[key])
        string += self.secret_key

        encoded = string.encode("utf8")
        signature = hashlib.md5(encoded).hexdigest()

        return signature
