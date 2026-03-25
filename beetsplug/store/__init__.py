# -*- coding: utf-8 -*-

"""Main module to control the beets store."""

import beets

from beets.plugins import BeetsPlugin
from beets.ui import Subcommand

from .app import App


class Store(BeetsPlugin):
    def __init__(self):
        super(Store, self).__init__()
        self.config.add(
            {
                "host": u"",
                "port": 8080,
                "cors_origins": "*",
            }
        )

    def parse(self, args):
        args = beets.ui.decargs(args)
        if args:
            self.config["host"] = args.pop(0)
        if args:
            self.config["port"] = int(args.pop(0))

    def func(self, lib, opts, args):
        self.parse(args)
        app = App(self.config, lib, beets.config["directory"].as_filename())
        app.run()

    def commands(self):
        cmd = Subcommand("store", help="start the Store web interface")

        cmd.func = self.func
        return [cmd]
