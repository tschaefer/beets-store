import hashlib
import requests
from time import time


API_ENDPOINT = 'http://ws.audioscrobbler.com/2.0/?format=json'
API_AUTH = "https://www.last.fm/api/auth?api_key=%s"


class LastFM:
    def __init__(self, api_key, secret_key, logger=None):
        self.api_key = api_key
        self.secret_key = secret_key
        self.logger = logger


    def request(self, method, session_key=None, parameters={}):
        parameters.update({
            'api_key': self.api_key,
            'method': method,
        })

        if session_key:
            parameters.update({'sk': session_key})

        parameters.update({'api_sig': self.sign_request(parameters)})

        response = requests.post(API_ENDPOINT, parameters)
        self.logger.info(response.status_code)

        return response


    def sign_request(self, parameters):
        string = ''
        keys = parameters.keys()

        for key in sorted(keys):
            string += key
            string += parameters[key]
        string += self.secret_key

        encoded = string.encode('utf8')

        signature = hashlib.md5(encoded).hexdigest()

        return signature


    def auth_url(self, callback=None):
        url = API_AUTH % self.api_key
        if callback:
            url = url + "&cb=%s" % callback

        return url


    def now_playing(self, song, artist, session_key):
        return self.request(
            'track.updateNowPlaying',
            session_key,
            {
                'artist': artist,
                'track': song
            }
        )


    def scrobble(self, song, artist, session_key):
        return self.request(
            'track.scrobble',
            session_key,
            {
                'artist': artist,
                'track': song,
                'timestamp': str(int(time()) - 30),
            }
        )


    def session(self, auth_token):
        response = self.request(
            'auth.getSession',
            parameters={'token': auth_token}
        )

        session = response.json()

        return session['session']['key']
