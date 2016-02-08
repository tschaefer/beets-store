# Beets Store

A plugin for the music geek's media organizer.

## Introduction

*Beets Store* is a web frontend for your music library organized by
[beets](http://beets.radbox.org/).

## Installation

Install package and scripts.

    $ pip install https://github.com/tschaefer/beets-store/archive/master.zip

## Usage

Add plugin settings to beets configuration file.

```
store:
	host: "::1"
	port: 8080
```

Example beets [configuration file](https://gist.github.com/tschaefer/daa09959eb7272715800#gistcomment-1684418)

Import audio files.

    $ beet import

Fetch cover art.

    $ beet fetch

Start the web service.

    $ beet store
