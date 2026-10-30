"""High-precision, allowlisted OCR parsers; all source material remains in memory."""
from datetime import date
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, model_validator

from .contracts import ALLOWLISTS, Candidate, Contract, DocumentError, DocumentType, FieldName, IdentityEvidence, StructuredResult
from .normalization import MONTHS, NORMALIZER_VERSION, clp, continuity, document_date, text
from .identity import extract_identity

PARSER_VERSION = 'deterministic-v1'


class Span(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    offset: int = Field(ge=0)
    length: int = Field(ge=0)


class Line(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    content: StrictStr = Field(max_length=20000)


class Page(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    pageNumber: int = Field(ge=1, le=2)
    lines: list[Line] = Field(default_factory=list, max_length=2000)
    spans: list[Span] = Field(default_factory=list, max_length=8)


class Layout(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True)
    content: StrictStr = Field(max_length=4_000_000)
    pages: list[Page] = Field(min_length=1, max_length=2)
    stringIndexType: str | None = None

    @model_validator(mode='after')
    def page_provenance(self):
        if [page.pageNumber for page in self.pages] != list(range(1, len(self.pages)+1)):
            raise ValueError('invalid_pages')
        for page in self.pages:
            if any(span.offset + span.length > len(self.content) for span in page.spans):
                raise ValueError('invalid_spans')
            if not page.lines and len(self.pages)>1 and (not page.spans or self.stringIndexType!='unicodeCodePoint'):
                raise ValueError('missing_page_provenance')
        return self

    def rows(self):
        rows = []
        for page in self.pages:
            if page.lines:
                values = [line.content for line in page.lines]
            else:
                values = (''.join(self.content[s.offset:s.offset+s.length] for s in page.spans)
                          if len(self.pages)>1 else self.content).splitlines()
            rows.extend((page.pageNumber, text(line)) for line in values if text(line))
        return rows


class RawCandidate(Contract):
    field: FieldName
    value: StrictStr | None = None
    detection: Literal['detected','ambiguous','not_detected']
    page: int = Field(ge=1, le=2, strict=True)

    @model_validator(mode='after')
    def unresolved_is_empty(self):
        if (self.detection=='detected') != (self.value is not None):
            raise ValueError('invalid_raw_candidate')
        return self


class RawResult(Contract):
    document_type: DocumentType
    candidates: list[RawCandidate] = Field(min_length=1, max_length=2)

    @model_validator(mode='after')
    def allowlist(self):
        fields = [c.field for c in self.candidates]
        if len(set(fields)) != len(fields) or set(fields) != ALLOWLISTS[self.document_type]:
            raise ValueError('document_allowlist')
        return self


def candidate(field, matches, *, unsafe=False, categorical=False):
    if not matches:
        return RawCandidate(field=field, detection='not_detected', page=1)
    values = {value for _,value in matches}
    # Monetary repetitions may be different periods/accounts, even at the same amount.
    if unsafe or any(value is None for _,value in matches) or (len(values)>1 if categorical else len(matches)>1):
        return RawCandidate(field=field, detection='ambiguous', page=matches[0][0])
    return RawCandidate(field=field, value=matches[0][1], detection='detected', page=matches[0][0])


def labelled(rows, labels, *, amount=False):
    pattern = re.compile(r'^(?:' + labels + r')(?=$|[\s:|=])\s*[:|=]?\s*(.*)$')
    matches = []
    for index,(page,line) in enumerate(rows):
        match = pattern.fullmatch(line)
        if not match:
            continue
        value = match[1].strip(' |')
        if not value and index+1<len(rows) and rows[index+1][0]==page:
            next_value = rows[index+1][1]
            # A standalone number could be an account/RUT. Require a currency marker.
            if not amount or next_value.startswith(('$','clp ')):
                value = next_value
        matches.append((page,value or None))
    return matches


FOREIGN = re.compile(r'\b(?:usd|eur|uf|dolares|euros|unidades de fomento)\b|us\$|u\$s')
NON_MONTHLY = re.compile(r'\b(?:quincenal|semanal|anual)\b')


def foreign_currency(rows):
    return any(FOREIGN.search(line) for _,line in rows if
               re.match(r'^(?:moneda|divisa|currency)\s*:',line) or line.startswith('valores expresados en '))


def multiple_pay_periods(rows):
    periods = [line for _,line in rows if re.match(r'^(?:periodo(?: de pago| de remuneracion)?|mes(?: de remuneracion| de pago)?)\s*:',line)]
    if len(set(periods))>1:
        return True
    for period in periods:
        named_months = {month for month in MONTHS if re.search(r'\b'+month+r'\b',period)}
        numeric_months = set()
        for token in re.findall(r'\b(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{4})\b',period):
            try:
                day = document_date(token)
                numeric_months.add((day.year,day.month))
            except ValueError:
                return True
        if len(named_months)>1 or len(numeric_months)>1 or re.search(r'\b(?:[2-9]|[1-9][0-9]+) meses\b',period):
            return True
    return False


class PayslipParser:
    document_type = DocumentType.payslip

    def parse(self, layout, reference):
        rows = layout.rows()
        matches = labelled(rows, r'(?:total )?liquido a pagar|renta liquida(?: mensual)?|sueldo liquido(?: mensual)?|remuneracion liquida mensual', amount=True)
        # An explicit incompatible period/currency is never converted silently.
        unsafe = foreign_currency(rows) or any(NON_MONTHLY.search(line) for _,line in rows)
        return RawResult(document_type=self.document_type, candidates=[
            candidate('ingreso_mensual',matches,unsafe=unsafe or multiple_pay_periods(rows))])


class SavingsParser:
    document_type = DocumentType.savings

    def parse(self, layout, reference):
        rows = layout.rows()
        matches = labelled(rows, r'(?:total )?ahorro disponible|saldo disponible(?: para giro)?|saldo de ahorro disponible', amount=True)
        accounts = sum(bool(re.match(r'^cuenta(?: de ahorro)?\s+(?:n(?:ro|umero)?\.?|n[°º])\s*[:.°º#-]?', line)) for _,line in rows)
        unsafe = accounts>1 or foreign_currency(rows)
        return RawResult(document_type=self.document_type, candidates=[candidate('ahorro_disponible',matches,unsafe=unsafe)])


CONTRACT_VALUES = {
    'indefinido':'indefinido', 'indefinida':'indefinido', 'duracion indefinida':'indefinido',
    'plazo fijo':'plazo_fijo', 'plazo_fijo':'plazo_fijo', 'a plazo fijo':'plazo_fijo', 'independiente':'independiente',
    'honorarios':'honorarios_variable', 'honorarios / variable':'honorarios_variable', 'honorarios_variable':'honorarios_variable', 'honorarios variable':'honorarios_variable',
    'a honorarios':'honorarios_variable', 'prestacion de servicios a honorarios':'honorarios_variable',
}
CONTINUITY_VALUES = {
    'menos de 6 meses':'menos_6_meses', 'entre 6 y 12 meses':'entre_6_y_12_meses',
    'entre 1 y 3 anos':'entre_1_y_3_anios', 'mas de 3 anos':'mas_3_anios',
}


class EmploymentParser:
    document_type = DocumentType.employment

    def parse(self, layout, reference):
        rows = layout.rows()
        contracts = labelled(rows, r'tipo de contrato|contrato(?: de trabajo)?(?: de)?|modalidad contractual')
        contracts = [(page,CONTRACT_VALUES.get(value.rstrip('.') if value else value)) for page,value in contracts]
        durations = [(page,CONTINUITY_VALUES.get(value.rstrip('.') if value else value))
                     for page,value in labelled(rows,r'continuidad laboral|antiguedad laboral')]
        starts = labelled(rows,r'fecha de ingreso|fecha de inicio(?: laboral| de contrato| de la relacion laboral)?|fecha de contratacion|inicio de la relacion laboral|presta servicios desde(?: el)?')
        issues = labelled(rows,r'fecha de emision|fecha de certificacion')
        ends = labelled(rows,r'fecha de termino(?: del contrato)?|fecha de vencimiento(?: del contrato)?')
        if starts:
            try:
                start_dates = {document_date(value) for _,value in starts if value}
                issue_dates = {document_date(value) for _,value in issues if value}
                end_dates = {document_date(value) for _,value in ends if value}
                if (any(value is None for _,value in starts+issues+ends) or len(start_dates)!=1
                        or len(issue_dates)>1 or len(end_dates)>1):
                    raise ValueError('ambiguous_dates')
                as_of = next(iter(issue_dates)) if issue_dates else reference
                start = next(iter(start_dates))
                if as_of>reference or (end_dates and next(iter(end_dates))<as_of):
                    raise ValueError('incompatible_dates')
                durations.append((starts[0][0],continuity(start,as_of)))
            except (ValueError, OverflowError):
                durations.append((starts[0][0],None))
        return RawResult(document_type=self.document_type, candidates=[
            candidate('tipo_contrato',contracts,categorical=True),
            candidate('continuidad_laboral',durations,categorical=True)])


PARSERS = {parser.document_type: parser() for parser in (PayslipParser,SavingsParser,EmploymentParser)}


def normalize_result(raw):
    raw = RawResult.model_validate(raw)
    candidates = []
    for item in raw.candidates:
        data = item.model_dump()
        if item.detection=='detected' and item.field in ('ingreso_mensual','ahorro_disponible'):
            try:
                data['value'] = clp(item.value)
                if item.field=='ingreso_mensual' and data['value']<=0:
                    raise ValueError('invalid_income')
            except ValueError:
                data.update(value=None,detection='ambiguous')
        candidates.append(Candidate.model_validate(data))
    return StructuredResult(document_type=raw.document_type,parser_version=PARSER_VERSION,
                            normalizer_version=NORMALIZER_VERSION,candidates=candidates)


def parse_document(document_type, layout, reference: date):
    try:
        kind = DocumentType(document_type)
        typed_layout = Layout.model_validate(layout)
        raw = PARSERS[kind].parse(typed_layout, reference)
        result = normalize_result(raw)
        identity = extract_identity(typed_layout.rows())
        return result.model_copy(update={'identity': IdentityEvidence(**identity) if identity else None})
    except (ValueError, ValidationError, TypeError, KeyError):
        # Never propagate Pydantic input excerpts or OCR strings into HTTP errors/logs.
        raise DocumentError('invalid_result') from None
