import pandas as pd
import json

# set names of excel and sheets
metrics_excel = "DevEx_Metrics.xlsx"
sheet_with_metrics = "metrics"
sheet_with_sources = "urls"
IMPLEMENTATION_COLUMNS = [
    'Implementation Cadence',
    'Implementation Target Goal',
    'Implementation Telemetry Sources',
    'Implementation Recipe Steps',
    'Implementation Provenance',
]
IMPLEMENTATION_PROVENANCE_VALUES = {
    'ai-generated',
    'ai-human-reviewed',
    'human-written',
}


def cell_text(value):
    return '' if pd.isna(value) else str(value).strip()


def split_pipe_values(value):
    return [item.strip() for item in cell_text(value).split('|') if item.strip()]


def format_drop_value(value):
    if pd.isna(value):
        return '<missing>'
    if isinstance(value, (int, float)) and value == int(value):
        return str(int(value))
    return str(value).strip()


def drop_rows_missing_required_fields(
    frame,
    required_columns,
    record_type,
    id_column,
    name_column,
    blank_columns,
):
    missing_required = frame[required_columns].isna()
    rows_to_drop = missing_required.any(axis=1)

    for index, row in frame.loc[rows_to_drop].iterrows():
        missing_column_names = blank_columns.columns[blank_columns.loc[index]].tolist()
        record_id = format_drop_value(row[id_column])
        record_name = format_drop_value(row[name_column])
        print(
            f'Dropped {record_type} {record_id} "{record_name}": '
            f'missing {", ".join(missing_column_names)}'
        )

    return frame.loc[~rows_to_drop].copy(), int(rows_to_drop.sum())


def parse_implementation(series):
    cadence = cell_text(series.get('Implementation Cadence', ''))
    target_goal = cell_text(series.get('Implementation Target Goal', ''))
    telemetry_sources = split_pipe_values(series.get('Implementation Telemetry Sources', ''))
    recipe_steps = split_pipe_values(series.get('Implementation Recipe Steps', ''))
    provenance = cell_text(series.get('Implementation Provenance', ''))
    metric_id = series['id']

    if provenance and provenance not in IMPLEMENTATION_PROVENANCE_VALUES:
        print(
            f"Warning: metric {metric_id} has invalid implementation provenance "
            f"{provenance!r}; omitting provenance."
        )
        provenance = ''

    if not cadence and not recipe_steps:
        return None

    implementation = {}
    if cadence:
        implementation['cadence'] = cadence
    if target_goal:
        implementation['target_goal'] = target_goal
    if telemetry_sources:
        implementation['telemetry_sources'] = telemetry_sources
    if recipe_steps:
        implementation['recipe_steps'] = recipe_steps
    if provenance:
        implementation['provenance'] = provenance

    missing_fields = []
    if not cadence:
        missing_fields.append('cadence')
    if not target_goal:
        missing_fields.append('target_goal')
    if not telemetry_sources:
        missing_fields.append('telemetry_sources')
    if not recipe_steps:
        missing_fields.append('recipe_steps')
    if not provenance:
        missing_fields.append('provenance')
    if missing_fields:
        print(
            f"Warning: metric {metric_id} implementation is missing "
            f"{', '.join(missing_fields)}."
        )

    return implementation

# import sheet with metrics from file
df = pd.read_excel(metrics_excel, sheet_name=sheet_with_metrics, engine="openpyxl")
df = df.loc[:, ~df.columns.str.contains('^Unnamed')]  # drop phantom columns from Excel

blank_columns = df.isna()
# Fill optional columns with defaults so rows aren't dropped for missing them
for optional_col in [
    'AlsoKnownAs',
    'AI Specific Category',
    'Related Metrics',
    'Outcome Goals',
    'Ease of Collection',
    'Tech Level',
    'Team Intrusion',
    *IMPLEMENTATION_COLUMNS,
]:
    if optional_col in df.columns:
        df[optional_col] = df[optional_col].fillna('')

df, rows_dropped = drop_rows_missing_required_fields(
    df,
    ['id', 'Name', 'Data Collection Type', 'Cardsort Group ID', 'Cardsort Subgroup ID'],
    'metric',
    'id',
    'Name',
    blank_columns,
)
if rows_dropped > 0:
    print(f"Warning: {rows_dropped} metric row(s) dropped due to missing required values.")

# convert 'Company', 'Research', and optional columns to string type
df['Company'] = df['Company'].astype(str)
df['Research'] = df['Research'].astype(str)
if 'Related Metrics' in df.columns:
    df['Related Metrics'] = df['Related Metrics'].astype(str)

# create dictionnary of cardsort groups
cardsort_groups = {}
for idx, series in df.iterrows():
    cardsort_groups[series["Cardsort Group ID"]] = series["Cardsort Group"]


# create dictionnary of cardsort sub groups
cardsort_sub_groups = {}
cardsort_sub_groups_to_groups_matching = {}

for idx, series in df.iterrows():
    cardsort_sub_groups[series["Cardsort Subgroup ID"]] = series["Cardsort Subgroup"]
    cardsort_sub_groups_to_groups_matching[series["Cardsort Subgroup ID"]] = series["Cardsort Group ID"]

# set master parent node
master_node_name = "Developer Experience Metrics"
master_node_id = 9999

# create entry for master node for json file.
master_list_of_dicts = [{
    "name": master_node_name,
    "id": master_node_id,
}]

# create the cardsort group entries for the json file.
cardsort_group_list_of_dicts = []
for key, value in cardsort_groups.items():
    cardsort_group_list_of_dicts.append({
        "name": value,
        "id": key,
        "parent": master_node_id,
    })

# create the cardsort sub group entries for the json file.
cardsort_sub_group_list_of_dicts = []
for key, value in cardsort_sub_groups.items():
    parent = cardsort_sub_groups_to_groups_matching[key]
    cardsort_sub_group_list_of_dicts.append({
        "name": value,
        "id": key,
        "parent": parent
    })

# create the metrics entries for the json file.
metrics_list_of_dicts = []
for idx, series in df.iterrows():

    # Sort synonyms alphabetically
    synonyms_unsorted = series["AlsoKnownAs"].split("; ")
    synonyms_sorted = sorted(synonyms_unsorted)
    alsoknownas = ("; ").join(synonyms_sorted)

    # create entry for every metric
    metric = {
        "name": series["Name"],
        "id": series["id"],
        "parent": series["Cardsort Subgroup ID"],
        "alsoknownas": alsoknownas,
        "company": series["Company"],
        "research": series["Research"],
        "type": series["Data Collection Type"],
        "value": series["value"],
        "company_mentions": series["Number of companies"],
        "research_mentions": series["Number of research"],
        "description": series["Definition"],
        "is_research": series["IS_Research"],
        "ai_specific_category": series["AI Specific Category"] if "AI Specific Category" in df.columns else "",
        "related_metrics": series["Related Metrics"] if "Related Metrics" in df.columns else "",
        "outcome_goals": series["Outcome Goals"] if "Outcome Goals" in df.columns else "",
        "ease_of_collection": series["Ease of Collection"] if "Ease of Collection" in df.columns else "",
        "prerequisites": {
            "tech_level": str(series["Tech Level"]).strip() if "Tech Level" in df.columns else "",
            "team_intrusion": str(series["Team Intrusion"]).strip() if "Team Intrusion" in df.columns else ""
        }
    }
    implementation = parse_implementation(series)
    if implementation:
        metric["implementation"] = implementation
    metrics_list_of_dicts.append(metric)

# combine all entries into one list
json_list = master_list_of_dicts + cardsort_group_list_of_dicts + cardsort_sub_group_list_of_dicts + metrics_list_of_dicts

# create json file for metrics
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(json_list, f, ensure_ascii=False, indent=4)

print(f"data.json written with {len(metrics_list_of_dicts)} metrics.")
implementation_count = sum('implementation' in metric for metric in metrics_list_of_dicts)
provenance_counts = {
    provenance: sum(
        metric.get('implementation', {}).get('provenance') == provenance
        for metric in metrics_list_of_dicts
    )
    for provenance in IMPLEMENTATION_PROVENANCE_VALUES
}
provenance_summary = ', '.join(
    f'{provenance}={count}' for provenance, count in sorted(provenance_counts.items())
)
print(
    f"Metrics summary: {len(metrics_list_of_dicts)} written; "
    f"{implementation_count} with implementation; provenance: {provenance_summary}."
)


# import sheet with urls from file
df = pd.read_excel(metrics_excel, sheet_name=sheet_with_sources, engine="openpyxl")
df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
blank_columns = df.isna()
# Fill company_size with 'N/A' so rows without it are not dropped
if 'company_size' in df.columns:
    df['company_size'] = df['company_size'].fillna('N/A')
df, rows_dropped = drop_rows_missing_required_fields(
    df,
    ['ref_number', 'ref_name', 'ref_link'],
    'source',
    'ref_number',
    'ref_name',
    blank_columns,
)
if rows_dropped > 0:
    print(f"Warning: {rows_dropped} source row(s) dropped due to missing required values.")

# convert ref_number to string type
df['ref_number'] = df['ref_number'].astype(str)

source_ids = []

# create entry for every source
for idx, series in df.iterrows():
    source_ids.append({
        "ref_number": series["ref_number"],
        "ref_name": series["ref_name"],
        "ref_link": series["ref_link"],
        "company_size": series["company_size"] if "company_size" in df.columns else "N/A"
    })

# create json file for source ids and urls
with open('source_ids.json', 'w', encoding='utf-8') as f:
    json.dump(source_ids, f, ensure_ascii=False, indent=4)

print(f"source_ids.json written with {len(source_ids)} sources.")
