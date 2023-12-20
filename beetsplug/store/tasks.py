# -*- coding: utf-8 -*-

"""Beets store Redis queue module to run 'long' tasks."""

import os
import time
import zipfile

from rq import Queue, Callback
from redis import Redis


def bundle(arguments):
    zfile = arguments.get('zfile')
    files = arguments.get('files')

    if os.path.exists(zfile):
        if (int(time.time()) - int(os.stat(zfile).st_ctime)) >= 17280:
            os.remove(zfile)
        else:
            return zfile

    if not os.path.exists(zfile):
        with zipfile.ZipFile(zfile, "w", zipfile.ZIP_DEFLATED) as zipfh:
            for file in files:
                zipfh.write(
                    file.decode("utf-8"),
                    os.path.basename(file).decode("utf-8"),
                )

    return zfile


def job_succeeded(job, connection, result, *args, **kwargs):
    connection.publish('rq:job:succeeded', job.id)


def job_failed(job, connection, *args, **kwargs):
    connection.publish('rq:job:failed', job.id)


class Task:
    def __init__(self):
        redis_url = os.getenv('BEETS_REDIS_URL', 'redis://localhost:6379')
        self.q = Queue(connection=Redis.from_url(redis_url))

    def run(self, name='bundle', arguments=None):
        return self.q.enqueue(globals()[name], arguments,
                              on_success=Callback(job_succeeded),
                              on_failure=Callback(job_failed))
