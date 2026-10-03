import copy
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.scoring_engine.co_debtor_consent import (
    invitation_expires_at,
    resolve_co_debtor_complement,
)
from app.scoring_engine.constants import CO_DEBTOR_INVITATION_TTL_DAYS


DOCUMENT = json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-17-cases.json").read_text())
FIXTURE_CREATED_AT = datetime(2026, 10, 1, tzinfo=timezone.utc)


def _fixture_arguments(case_input):
    arguments = {
        "invitation_status": case_input.get("invitation_status"),
        "treatment_consent": case_input.get("treatment_consent", case_input.get("consent")),
        "token_valid": case_input.get("token_valid", False),
        "phone_verified": case_input.get("phone_verified", False),
        "has_submitted_values": "submitted_values" in case_input,
        "co_debtor_action": case_input.get("co_debtor_action"),
        "revoked": case_input.get("revoked", False),
        "replacement_invitation_created": case_input.get("replacement_invitation_created", False),
    }
    if "now_before_expiry" in case_input:
        arguments["created_at"] = FIXTURE_CREATED_AT
        expiry = invitation_expires_at(FIXTURE_CREATED_AT)
        arguments["now"] = expiry - timedelta(microseconds=1) if case_input["now_before_expiry"] else expiry
    return arguments


class TestAlg17(unittest.TestCase):
    def test_documented_cases(self):
        self.assertEqual(len(DOCUMENT["cases"]), 6)
        for case in DOCUMENT["cases"]:
            with self.subTest(case=case["name"]):
                result = resolve_co_debtor_complement(**_fixture_arguments(case["input"]))
                for field, expected in case["expect"].items():
                    canonical_field = "complement_confirmation_status" if field == "confirmation_status" else field
                    self.assertEqual(result[canonical_field], expected)

    def test_no_invitation_keeps_lead_declaration_unconfirmed(self):
        lead_declared = {"ingreso_mensual_complementario": 1_100_000, "relacion_complementario": "pareja"}

        result = resolve_co_debtor_complement(invitation_status=None, lead_declared=lead_declared)

        self.assertEqual(result["complement_source"], "lead_declared")
        self.assertEqual(result["complement_confirmation_status"], "not_confirmed")
        self.assertEqual(result["selected_complement"], lead_declared)

    def test_same_input_and_time_produce_the_same_resolution(self):
        created_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
        arguments = {
            "invitation_status": "pending",
            "created_at": created_at,
            "now": created_at + timedelta(days=2),
            "lead_declared": {"ingreso_mensual_complementario": 900_000},
        }

        self.assertEqual(resolve_co_debtor_complement(**arguments), resolve_co_debtor_complement(**arguments))

    def test_valid_confirmation_overrides_financial_values_but_keeps_lead_relation(self):
        lead_declared = {
            "ingreso_mensual_complementario": 800_000,
            "deuda_mensual_complementario": 10_000,
            "relacion_complementario": "pareja",
        }
        co_debtor_confirmed = {
            "ingreso_mensual_complementario": 1_200_000,
            "deuda_mensual_complementario": 90_000,
            "tipo_contrato_complementario": "indefinido",
            "continuidad_laboral_complementario": "mas_3_anios",
            "morosidad_complementario": "no",
            "relacion_complementario": "otro",
        }

        result = resolve_co_debtor_complement(
            invitation_status="pending",
            token_valid=True,
            phone_verified=True,
            treatment_consent=True,
            has_submitted_values=True,
            lead_declared=lead_declared,
            co_debtor_confirmed=co_debtor_confirmed,
        )

        self.assertEqual(result["complement_source"], "co_debtor_confirmed")
        self.assertEqual(result["selected_complement"]["ingreso_mensual_complementario"], 1_200_000)
        self.assertEqual(result["selected_complement"]["deuda_mensual_complementario"], 90_000)
        self.assertEqual(result["selected_complement"]["relacion_complementario"], "pareja")

    def test_revocation_never_selects_confirmed_values_for_future_evaluations(self):
        result = resolve_co_debtor_complement(
            invitation_status="confirmed",
            revoked=True,
            treatment_consent=True,
            co_debtor_confirmed={"ingreso_mensual_complementario": 1_200_000},
        )

        self.assertEqual(result["complement_source"], "excluded_after_revocation")
        self.assertIsNone(result["selected_complement"])
        self.assertFalse(result["rescore_required"])

    def test_expiry_uses_supplied_time_and_the_central_ttl_constant(self):
        created_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
        expiry = invitation_expires_at(created_at)

        self.assertEqual(expiry, created_at + timedelta(days=CO_DEBTOR_INVITATION_TTL_DAYS))
        self.assertEqual(
            resolve_co_debtor_complement(
                invitation_status="pending", now=expiry - timedelta(microseconds=1), expires_at=expiry
            )["invitation_status"],
            "pending",
        )
        self.assertEqual(
            resolve_co_debtor_complement(
                invitation_status="pending", now=expiry, expires_at=expiry
            )["invitation_status"],
            "expired",
        )

    def test_resolver_does_not_mutate_input_mappings(self):
        lead_declared = {
            "ingreso_mensual_complementario": 800_000,
            "relacion_complementario": "pareja",
        }
        co_debtor_confirmed = {
            "ingreso_mensual_complementario": 1_200_000,
            "deuda_mensual_complementario": 90_000,
            "tipo_contrato_complementario": "indefinido",
            "continuidad_laboral_complementario": "mas_3_anios",
            "morosidad_complementario": "no",
        }
        original_lead, original_confirmed = copy.deepcopy(lead_declared), copy.deepcopy(co_debtor_confirmed)

        resolve_co_debtor_complement(
            invitation_status="pending",
            token_valid=True,
            phone_verified=True,
            treatment_consent=True,
            has_submitted_values=True,
            lead_declared=lead_declared,
            co_debtor_confirmed=co_debtor_confirmed,
        )

        self.assertEqual(lead_declared, original_lead)
        self.assertEqual(co_debtor_confirmed, original_confirmed)
