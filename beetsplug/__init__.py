# -*- coding: utf-8 -*-

"""A namespace package for beets plugins."""

# Make this a namespace package.
from pkgutil import extend_path
__path__ = extend_path(__path__, __name__)
