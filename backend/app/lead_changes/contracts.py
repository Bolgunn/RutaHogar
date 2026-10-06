from datetime import datetime


class LeadChangeError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def parse_time(value):
    if value is None:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise LeadChangeError("invalid_timestamp")
    return parsed
