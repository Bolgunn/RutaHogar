"""Conservative identity comparison; values never enter financial candidates or logs."""
from difflib import SequenceMatcher
import re
import unicodedata


def normalize_rut(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9kK.\-\s]+", value):
        return None
    compact = re.sub(r"[.\-\s]", "", value).upper()
    if not re.fullmatch(r"[0-9]{7,8}[0-9K]", compact):
        return None
    total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(compact[:-1])))
    check = 11 - total % 11
    expected = "0" if check == 11 else "K" if check == 10 else str(check)
    return compact if compact[-1] == expected else None


def name_tokens(value):
    if not isinstance(value, str):
        return ()
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return tuple(re.findall(r"[a-z]+", text))


def names_match(left, right):
    a, b = name_tokens(left), name_tokens(right)
    if len(a) < 2 or len(b) < 2:
        return None
    # A missing middle name or reordered full name is common in documents.
    if len(set(a) & set(b)) >= 2:
        return True
    # Permit a small OCR difference in one token while requiring two matches.
    matches = sorted(((SequenceMatcher(None, x, y).ratio(), x, y) for x in set(a) for y in set(b)
                      if x == y or (len(x) >= 4 and len(y) >= 4)), reverse=True)
    used_a, used_b = set(), set()
    for ratio, x, y in matches:
        if ratio >= 0.85 and x not in used_a and y not in used_b:
            used_a.add(x)
            used_b.add(y)
    if len(used_a) >= 2:
        return True
    sa, sb = " ".join(sorted(a)), " ".join(sorted(b))
    return SequenceMatcher(None, sa, sb).ratio() >= 0.86


def compare_identity(profile, evidence):
    """Only concrete contradictions are inconsistent; absent/invalid is unknown."""
    if not evidence:
        return 'indeterminate'
    profile_rut, doc_rut = normalize_rut(profile.get('rut')), normalize_rut(evidence.get('rut'))
    if profile_rut and doc_rut and profile_rut != doc_rut:
        return 'inconsistent'
    parts = [profile.get('nombre'), profile.get('apellido_paterno'), profile.get('apellido_materno')]
    profile_name = ' '.join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    if len(name_tokens(profile_name)) < 2:
        profile_name = profile.get('full_name') or ''
    name_match = names_match(profile_name, evidence.get('name'))
    if name_match is False:
        return 'inconsistent'
    return 'consistent' if (profile_rut and doc_rut) or name_match is True else 'indeterminate'


def extract_identity(rows):
    """Extract only explicit subject-labelled values; ambiguous labels are discarded."""
    found = {'rut': [], 'name': []}
    patterns = {
        'rut': re.compile(r'(?:rut|r\.u\.t\.?) (?:del? )?(?:trabajador|empleado|titular|afiliado|beneficiario)'),
        'name': re.compile(r'nombre(?: completo)? (?:del? )?(?:trabajador|empleado|titular|afiliado|beneficiario)'),
    }
    # PDF text extraction can merge employer/worker columns into one line.
    # Bound each value by the NEXT labelled field, including employer fields,
    # but continue to accept identity only from explicit subject labels.
    labels = re.compile(r'(?<!\w)(?P<label>(?:rut|r\.u\.t\.?|nombre(?: completo)?)'
                        r'(?: (?:del? )?(?:trabajador|empleado|titular|afiliado|beneficiario|empleador|empresa))?'
                        r'|razon social|cargo|periodo|fecha de emision|fecha de ingreso)\s*[:|=]\s*')
    for _, line in rows:
        matches = list(labels.finditer(line))
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
            for field, pattern in patterns.items():
                if not pattern.fullmatch(match.group('label')):
                    continue
                value = line[match.end():end].strip()
                if field == 'rut':
                    value = normalize_rut(value)
                elif len(name_tokens(value)) < 2 or len(value) > 160 or re.search(r'[\d:|=]', value):
                    value = None
                if value:
                    found[field].append(value)
    evidence = {}
    for field, values in found.items():
        normalized = {value if field == 'rut' else ' '.join(name_tokens(value)) for value in values}
        if len(normalized) == 1:
            evidence[field] = values[0]
    return evidence
