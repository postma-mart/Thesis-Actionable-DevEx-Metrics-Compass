import json
import random
from pathlib import Path


RECORD_COUNT = 500
TIER_1_COUNT = 125
TIER_2_COUNT = 75
TIER_3_COUNT = 5
METRIC_ID_MIN = 1
METRIC_ID_MAX = 121

ORG_SIZES = ["1-50", "51-250", "251-500"]
PRODUCT_CONTEXTS = [
    "B2B SaaS / Web Platform",
    "Consumer Mobile App",
    "Regulated Enterprise / On-Premise",
    "Embedded / Hardware",
]
GOALS = [
    "Developer Experience",
    "Organizational Effectiveness",
    "Product Excellence",
]
FRICTION_AREAS = [
    "Process",
    "Developer Enablement",
    "Quality",
    "System",
    "Team",
    "Output",
    "Business",
    "Customer",
]
TECH_LEVELS = ["High", "Partial", "Low"]
TEAM_INTRUSION_LEVELS = [
    "Passive Only",
    "Light Participation",
    "Active Collaboration",
]
BANDWIDTH_LEVELS = [
    "Minimal (~8h)",
    "Moderate (~24h)",
    "Dedicated (40h+)",
]


def create_record(index: int, profile: dict | None = None) -> dict:
    friction_count = random.randint(1, 2)
    metric_count = random.randint(4, 8)

    record = {
        "user_id": f"mock_usr_{index + 1:03d}",
        "cohort_orgSize": random.choice(ORG_SIZES),
        "cohort_productContext": random.choice(PRODUCT_CONTEXTS),
        "cohort_goal": random.choice(GOALS),
        "cohort_friction": random.sample(FRICTION_AREAS, friction_count),
        "cohort_techLevel": random.choice(TECH_LEVELS),
        "cohort_teamIntrusion": random.choice(TEAM_INTRUSION_LEVELS),
        "cohort_bandwidth": random.choice(BANDWIDTH_LEVELS),
        "selected_metric_ids": sorted(
            random.sample(range(METRIC_ID_MIN, METRIC_ID_MAX + 1), metric_count)
        ),
    }
    if profile:
        record.update(profile)
    return record


def create_tiered_records() -> list[dict]:
    records = []

    # Tier 1: 25% of records share all three dimensions, satisfying the >=10 threshold.
    tier_1_profile = {
        "cohort_orgSize": "1-50",
        "cohort_productContext": "B2B SaaS / Web Platform",
        "cohort_goal": "Developer Experience",
    }
    records.extend(
        create_record(index, tier_1_profile) for index in range(TIER_1_COUNT)
    )

    # Tier 2: 15% share a product context, but are spread across nine exact
    # profiles so that no org-size/goal combination reaches the Tier 1 threshold.
    tier_2_profiles = [
        {
            "cohort_orgSize": org_size,
            "cohort_productContext": "Consumer Mobile App",
            "cohort_goal": goal,
        }
        for org_size in ORG_SIZES
        for goal in GOALS
    ]
    for offset in range(TIER_2_COUNT):
        profile = tier_2_profiles[offset % len(tier_2_profiles)]
        records.append(create_record(TIER_1_COUNT + offset, profile))

    # Tier 3: fewer than 10 users share this product context.
    tier_3_profile = {"cohort_productContext": "Embedded / Hardware"}
    records.extend(
        create_record(index, tier_3_profile)
        for index in range(TIER_1_COUNT + TIER_2_COUNT, TIER_1_COUNT + TIER_2_COUNT + TIER_3_COUNT)
    )

    return records


def validate_tiered_records(records: list[dict]) -> None:
    tier_1_matches = [
        record
        for record in records
        if record["cohort_orgSize"] == "1-50"
        and record["cohort_productContext"] == "B2B SaaS / Web Platform"
        and record["cohort_goal"] == "Developer Experience"
    ]
    tier_2_matches = [
        record
        for record in records
        if record["cohort_productContext"] == "Consumer Mobile App"
    ]
    tier_3_matches = [
        record
        for record in records
        if record["cohort_productContext"] == "Embedded / Hardware"
    ]

    assert len(records) == RECORD_COUNT
    assert len(tier_1_matches) >= 10
    assert len(tier_2_matches) >= 10
    assert len(tier_3_matches) < 10

    for org_size in ORG_SIZES:
        for goal in GOALS:
            exact_tier_2_matches = [
                record
                for record in tier_2_matches
                if record["cohort_orgSize"] == org_size and record["cohort_goal"] == goal
            ]
            assert len(exact_tier_2_matches) < 10


def main() -> None:
    records = create_tiered_records()
    # Keep the seeded Tier 2 and Tier 3 contexts isolated so random records
    # cannot accidentally change their waterfall tier.
    while len(records) < RECORD_COUNT:
        index = len(records)
        records.append(create_record(index, {"cohort_productContext": "Regulated Enterprise / On-Premise"}))
    validate_tiered_records(records)
    output_path = Path(__file__).resolve().parent.parent / "compass" / "data" / "mock_cohort_data.json"
    output_path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {len(records)} mock cohort records to {output_path} "
        f"(Tier 1: {TIER_1_COUNT}, Tier 2: {TIER_2_COUNT}, Tier 3: {TIER_3_COUNT})"
    )


if __name__ == "__main__":
    main()
