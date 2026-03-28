# -*- coding: utf-8 -*-

"""Logging configuration for beets store.

Provides a logfmt formatter and a configure() function.

Log format (Go-style logfmt):
  time=2024-01-01T12:00:00.123Z level=info msg=request method=GET status=200
"""

import logging
import os

from datetime import datetime, timezone

RECORD_SKIP = frozenset(
    {
        "args",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "thread",
        "threadName",
        "taskName",
    }
)


def _quote(value):
    """Quote a logfmt value if it contains spaces, equals signs, or quotes."""
    value = str(value)
    if any(c in value for c in (" ", "=", '"')):
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


class LogfmtFormatter(logging.Formatter):
    """Formats log records as logfmt key=value pairs."""

    def format(self, record):
        record.message = record.getMessage()
        t = datetime.fromtimestamp(record.created, tz=timezone.utc)
        timestamp = t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"

        parts = [
            f"time={timestamp}",
            f"level={record.levelname.lower()}",
            f"msg={_quote(record.message)}",
        ]

        for key, value in record.__dict__.items():
            if key not in RECORD_SKIP and not key.startswith("_"):
                parts.append(f"{key}={_quote(value)}")

        if record.exc_info:
            exc_text = self.formatException(record.exc_info).replace("\n", "\\n")
            parts.append(f"trace={_quote(exc_text)}")

        return " ".join(parts)


def configure(debug=False):
    """Configure the root logger with logfmt output."""
    handler = logging.StreamHandler()
    handler.setFormatter(LogfmtFormatter())

    loglevel = os.environ.get("BEETS_LOG_LEVEL", "INFO")
    if debug:
        loglevel = "DEBUG"

    logger = logging.getLogger()
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(loglevel)
