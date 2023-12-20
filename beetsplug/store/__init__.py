# -*- coding: utf-8 -*-

"""Main module to control the beets store."""

import beets

from beets.plugins import BeetsPlugin
from beets.ui import Subcommand

from .app import App

import waitress


class Store(BeetsPlugin):
    def __init__(self):
        super(Store, self).__init__()
        self.config.add(
            {
                "host": u"",
                "port": 8080,
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
        app = App(self.config, lib, beets.config["directory"].get())

        if opts.wsgi:
            listen = "{}:{}".format(
                self.config["host"].get(), self.config["port"].get(int)
            )
            return waitress.serve(app.app, listen=listen)

        app.run()

    def commands(self):
        cmd = Subcommand("store", help="start the Store web interface")
        cmd.parser.add_option(
            "-w",
            "--wsgi",
            dest="wsgi",
            action="store_true",
            default=False,
            help="start the store as a WSGI app",
        )

        cmd.func = self.func
        return [cmd]
