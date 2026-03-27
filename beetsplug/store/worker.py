# -*- coding: utf-8 -*-

"""Beets store Redis queue worker."""

import os
import zipfile

from rq import Queue, Callback
from redis import Redis

REDIS_URL = os.getenv("BEETS_REDIS_URL", "redis://localhost:6379")


def bundle(arguments):
    """Bundle files into a zip archive."""
    zfile = arguments.get("zfile")
    files = arguments.get("files")

    if os.path.exists(zfile):
        os.remove(zfile)

    with zipfile.ZipFile(zfile, "w", zipfile.ZIP_DEFLATED) as zipfh:
        for file in files:
            file_str = file.decode("utf-8") if isinstance(file, bytes) else file
            zipfh.write(file_str, os.path.basename(file_str))

    return zfile


def job_succeeded(job, connection, result, *args, **kwargs):
    """Publish job success to the Redis channel."""
    connection.publish("rq:job:succeeded", job.id)


def job_failed(job, connection, *args, **kwargs):
    """Publish job failure to the Redis channel."""
    connection.publish("rq:job:failed", job.id)


class Worker:
    """Manages the Redis queue for enqueuing bundle jobs."""

    def __init__(self):
        """Initialize Redis connection and queue."""
        self.q = Queue(connection=Redis.from_url(REDIS_URL))

    def run(self, name="bundle", arguments=None):
        """Enqueue a job by name."""
        return self.q.enqueue(
            globals()[name],
            arguments,
            on_success=Callback(job_succeeded),
            on_failure=Callback(job_failed),
        )
