#!/usr/bin/env python3
"""Hourly/manual scheduler transport. Only aggregate allowlisted counters reach stdout."""
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

COUNTERS = {'selected', 'attempted', 'storage_deleted', 'azure_deleted', 'purged',
            'retried', 'skipped', 'failed', 'unresolved', 'overdue_originals',
            'pending_originals', 'pending_azure', 'unresolved_submissions'}
FLAGS = {'busy', 'budget_exhausted', 'batch_full'}
MAX_RESPONSE_BYTES = 65536
MAX_CALLS = 4


class CleanupInvocationError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the bearer capability to another origin/path.
        return None


def invoke(endpoint, secret, *, opener=None):
    try:
        if not isinstance(endpoint, str) or any(ord(char) < 33 for char in endpoint):
            raise ValueError
        parsed = urlsplit(endpoint)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.port not in (None, 443) or parsed.query or parsed.fragment
                or parsed.path != '/tracking/documents/cleanup' or not secret or '\n' in secret or '\r' in secret):
            raise ValueError
    except (TypeError, ValueError):
        raise CleanupInvocationError('invalid_configuration') from None
    request = Request(endpoint, method='POST', headers={'Authorization': 'Bearer '+secret,
                      'Accept': 'application/json', 'Cache-Control': 'no-store'})
    try:
        with (opener or build_opener(NoRedirect())).open(request, timeout=55) as response:
            if response.status != 200:
                raise CleanupInvocationError('endpoint_unavailable')
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict) or type(data.get('busy')) is not bool:
            raise ValueError
        report = {}
        for key in COUNTERS | FLAGS:
            if key not in data:
                continue
            value = data[key]
            if ((key in FLAGS and type(value) is not bool)
                    or (key in COUNTERS and (type(value) is not int or value < 0))):
                raise ValueError
            report[key] = value
        if not data['busy'] and not {'storage_deleted','azure_deleted','failed','retried'} <= report.keys():
            raise ValueError
        return report
    except (HTTPError, URLError, TimeoutError, OSError):
        raise CleanupInvocationError('endpoint_unavailable') from None
    except (ValueError, TypeError):
        raise CleanupInvocationError('invalid_response') from None


def run(endpoint, secret, *, call=invoke, sleep=time.sleep, emit=print):
    """Bounded replay/drain; DB leases and durable due times remain authoritative."""
    report = None
    for attempt in range(MAX_CALLS):
        try:
            report = call(endpoint, secret)
        except CleanupInvocationError:
            if attempt + 1 == MAX_CALLS:
                emit('HU23 cleanup invocation failed; check server configuration/availability.')
                return 1
        else:
            emit('HU23 cleanup counters: '+json.dumps(report, sort_keys=True))
            if report.get('overdue_originals', 0) or report.get('unresolved_submissions', 0):
                emit('HU23 cleanup requires operational review; retention/submission alert.')
                return 1
            if not any(report.get(key) for key in ('busy','batch_full','budget_exhausted','failed','retried','pending_originals','pending_azure')):
                return 0
        if attempt + 1 < MAX_CALLS:
            sleep(5 * (2 ** attempt))
    emit('HU23 cleanup incomplete; check pending work and next scheduled run.')
    return 1


if __name__ == '__main__':
    sys.exit(run(os.getenv('HU23_CLEANUP_URL', ''), os.getenv('HU23_CLEANUP_CRON_TOKEN', '')))
