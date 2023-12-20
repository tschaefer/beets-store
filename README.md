# Beets Store

A plugin for the music geek's media organizer.

## Introduction

*Beets Store* is a web frontend for your music library organized by
[beets](http://beets.radbox.org/).

* Play the music in your browser.
* Optional scrobble the played music info to [LastFM](https://www.last.fm)
* Download the music files and entire albums (A zipped directory with the music
  files and the album cover image.)

## Installation

Install required services.

    $ apt install redis

Install package and scripts.

    $ git clone https://github.com/tschaefer/beets-store
    $ cd beets-store
    $ pipx install --include-deps .

## Usage

Add plugin settings to beets configuration file.

```
store:
  host: "::1"
  port: 8080
  zipdir: /tmp/beets/store/zip
  lastfm:
    api_key: API_KEY
    secret_key: SECRET_KEY
```
The `lastfm` settings are optional. If you don't want to scrobble leave the
settings out.

Example beets [configuration file](https://gist.github.com/tschaefer/daa09959eb7272715800#gistcomment-1684418)

Import audio files.

    $ beet import /music

Fetch cover art.

The album art image must be stored as `cover.jpg` alongside the music files
for an album. For optimal display all the images should have an equal width and
height of at least 300x300 px.

    $ beet fetchart

Start job queue worker.

The job queue is used to create album zip files for the download.

    $ rq worker

Start the web service.

    $ beet store

### Docker

Configure environment file.

Set `BEETS_MUSIC_VOLUME` in the environment file `docker-compose.env`.

For overriding the configuration file and persist the database enable and set
the proper settings in the enviroment and compose files.

Start the service.

    $ docker compose --env-file docker-compose.env up

## License

[BSD 3-Clause “New” or “Revised” License](https://choosealicense.com/licenses/bsd-3-clause/)

### Further thirdparty license

 * [beetsplug/store/static/img/404.jpg](https://pngimg.com/image/101094)

## Is it any good?

[Yes](https://news.ycombinator.com/item?id=3067434)
