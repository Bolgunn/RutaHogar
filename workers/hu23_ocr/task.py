"""One bounded child per request: raw document/text die with this process."""
import json
import os
import sys

from .engine import download, extract


def main():
    try:
        if os.name == 'posix':
            import resource
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024**2, 512 * 1024**2))
            resource.setrlimit(resource.RLIMIT_CPU, (35, 35))
        request = json.loads(sys.stdin.buffer.read(8193))
        data, extension = download(request['source_url'], os.environ['HU23_OCR_STORAGE_ORIGIN'])
        result = extract(data, extension, request['document_type'], request['reference_date'])
        del data
        sys.stdout.write(json.dumps(result))
    except Exception:
        # Never serialize exceptions: third-party messages may contain source material.
        sys.stdout.write('{"error":"local_processing_failed"}')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
