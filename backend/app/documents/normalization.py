"""Deterministic Chilean representations. No currency conversion or numeric tolerance."""
import calendar
from datetime import date
from decimal import Decimal
import re
import unicodedata

NORMALIZER_VERSION = 'clp-calendar-v1'


def text(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', value.casefold().replace('\u00a0', ' ')).strip(' \t|')


def clp(value):
    """Whole-token CLP grammar; never salvage digits from noisy/foreign/multiple amounts."""
    value = text(value)
    value = re.sub(r'(?<=\d)\s*\.\s*(?=\d)', '.', value)
    value = re.sub(r'\.\s*-$', '', value).rstrip()
    match = re.fullmatch(r'(?:(?:clp\s*\$?|\$)\s*)?'
        r'([0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{1,3}(?: [0-9]{3})+)'
        r'(,[0-9]{1,2})?\s*(?:clp|pesos(?: chilenos)?)?', value)
    if not match:
        raise ValueError('ambiguous_amount')
    number = Decimal(match[1].replace('.', '').replace(' ', '') + (match[2] or '').replace(',', '.'))
    if number > 9_007_199_254_740_991 or Decimal(str(float(number))) != number:
        raise ValueError('ambiguous_amount')
    return float(number)


MONTHS = dict(zip(('enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'), range(1,13)))


def document_date(value):
    value = text(value).rstrip('.')
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return date.fromisoformat(value)
    match = re.fullmatch(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', value)
    if match:
        return date(int(match[3]), int(match[2]), int(match[1]))
    match = re.fullmatch(r'(\d{1,2}) de ([a-z]+) de (\d{4})', value)
    if match and match[2] in MONTHS:
        return date(int(match[3]), MONTHS[match[2]], int(match[1]))
    raise ValueError('ambiguous_date')


def add_months(start, months):
    year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
    return date(year, month + 1, min(start.day, calendar.monthrange(year, month + 1)[1]))


def continuity(start, reference):
    if start > reference:
        raise ValueError('future_start')
    if reference < add_months(start, 6):
        return 'menos_6_meses'
    if reference < add_months(start, 12):
        return 'entre_6_y_12_meses'
    if reference <= add_months(start, 36):
        return 'entre_1_y_3_anios'
    return 'mas_3_anios'
