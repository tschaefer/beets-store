# -*- coding: utf-8 -*-

import os
import sys

from setuptools import setup

setup (
        name='beets-store',
        version='0.0.1',
        packages=['beetsplug', 'beetsplug.store'],
        install_requires=['beets >= 1.3.10', 'Flask >= 0.10.1'],
        author='Tobias Schäfer',
        author_email='beets-store@blackoxorg',
        url='https://github.com/tschaefer/beets-store',
        description="A plugin for the music geek's media organizer Beets",
        license='BSD',
        include_package_data=True
)
