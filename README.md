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

Start the web service.

    $ beet store
