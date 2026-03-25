# -*- coding: utf-8 -*-

"""Dispatcher: enqueues bundle jobs and broadcasts completion events."""

import json
import os

from redis import Redis
from rq.exceptions import NoSuchJobError
from rq.job import Job

from .worker import Worker
from .utils import media_url

REDIS_URL = os.getenv('BEETS_REDIS_URL', 'redis://localhost:6379')


class Dispatcher:
    """Owns the job queue and the Redis broker. Enqueues bundle tasks,
    stores job metadata, subscribes to completion events, and emits the
    result to the appropriate SocketIO room."""

    def __init__(self, app, ws):
        self._app = app
        self._ws = ws
        self._broker = Redis.from_url(REDIS_URL)
        self._worker = Worker()
        self._started = False

    _ACTIVE_STATUSES = {'created', 'queued', 'started', 'deferred', 'scheduled'}

    def job_enqueue(self, arguments, info):
        """Enqueue a bundle task and store its metadata. Returns the RQ job."""
        rq_job = self._worker.run('bundle', arguments)
        self._broker.set('beets:job:' + rq_job.id, json.dumps(info), ex=86400)
        self._broker.set('beets:album:' + str(info['album_id']), rq_job.id, ex=3600)
        return rq_job

    def job_active(self, album_id):
        """Return the job_id of an in-progress job for the given album, or None."""
        raw = self._broker.get('beets:album:' + str(album_id))
        if not raw:
            return None
        job_id = raw.decode() if isinstance(raw, bytes) else raw
        try:
            status = Job.fetch(job_id, connection=self._broker).get_status()
            if status and status.value in self._ACTIVE_STATUSES:
                return job_id
        except NoSuchJobError:
            pass
        self._broker.delete('beets:album:' + str(album_id))
        return None

    def job_ready(self, job_id):
        """Return the cached download payload for a completed job, or None."""
        raw = self._broker.get('beets:ready:' + job_id)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return None

    def run(self):
        """Start the background listener task (idempotent)."""
        if not self._started:
            self._started = True
            self._ws.start_background_task(self._listen)

    def _listen(self):
        pubsub = self._broker.pubsub()
        pubsub.subscribe('rq:job:succeeded', 'rq:job:failed')
        while True:
            try:
                message = pubsub.get_message(ignore_subscribe_messages=True)
                if message and message['type'] == 'message':
                    self._handle(message)
            except Exception:
                self._app.logger.exception('dispatcher listener error')
            self._ws.sleep(0.1)

    def _handle(self, message):
        channel = message['channel']
        if isinstance(channel, bytes):
            channel = channel.decode()

        job_id = message['data']
        if isinstance(job_id, bytes):
            job_id = job_id.decode()

        raw = self._broker.get('beets:job:' + job_id)
        if not raw:
            return

        try:
            meta = json.loads(raw)
        except (ValueError, TypeError):
            return

        if channel == 'rq:job:succeeded':
            self._on_succeeded(job_id, meta)
        elif channel == 'rq:job:failed':
            self._on_failed(job_id, meta)

    def _on_succeeded(self, job_id, meta):
        with self._app.app_context():
            url = media_url(meta['zfile'])
        payload = {
            'job': job_id,
            'album_id': meta['album_id'],
            'album': meta['album'],
            'albumartist': meta['albumartist'],
            'artpath': meta.get('artpath'),
            'url': url,
        }

        # Cache briefly so watch_job can catch up if the client joins after
        # this emit.
        self._broker.set('beets:ready:' + job_id, json.dumps(payload), ex=300)
        self._broker.delete('beets:album:' + str(meta['album_id']))
        self._ws.emit('download_ready', payload, room='job:' + job_id)

    def _on_failed(self, job_id, meta):
        self._broker.delete('beets:album:' + str(meta['album_id']))
        self._ws.emit('download_failed', {
            'job': job_id,
            'album': meta['album'],
            'albumartist': meta['albumartist'],
        }, room='job:' + job_id)
