"""Separate executed tools from budget rejections, including older saved traces."""

from arena.locales import TEXT

BUDGET_EXHAUSTED = TEXT["tool.budget_exhausted"]["zh"]
# A tuple, not a set: tool results may be unhashable lists.
BUDGET_MESSAGES = tuple(TEXT["tool.budget_exhausted"].values())


def tool_records(records):
    return [
        {**record, "executed": record.get("executed", record["result"] not in BUDGET_MESSAGES)} for record in records
    ]
