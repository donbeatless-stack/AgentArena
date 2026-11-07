"""Isolated, checkpointed role calls with provider-compatible typed responses."""

import json
from typing import TypeVar

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import AIMessage
from pydantic import BaseModel, ValidationError

from arena.agents.providers import build_model, is_deepseek
from arena.infrastructure.events import emit
from arena.locales import current_language, localize_schema, tr

ResponseModel = TypeVar("ResponseModel", bound=BaseModel)


def parse_model_response(schema: type[ResponseModel], content: str, role: str, language=None) -> ResponseModel:
    """Read one complete JSON value; never repair incomplete or invalid business data."""
    language = language or current_language()
    text = content.lstrip()
    try:
        data, end = json.JSONDecoder().raw_decode(text)
    except json.JSONDecodeError as error:
        raise ValueError(tr("parse.malformed", language)) from error
    try:
        value = schema.model_validate(data)
    except ValidationError as error:
        fields = [
            ".".join(str(part) for part in item["loc"]) or tr("parse.root", language)
            for item in error.errors(include_input=False, include_url=False)
        ]
        separator = tr("parse.field_separator", language)
        raise ValueError(tr("parse.invalid", language, fields=separator.join(fields[:3]))) from error
    if text[end:].strip():
        emit(
            role,
            "response_normalized",
            "已读取完整 JSON，忽略末尾附加内容",
            schema=schema.__name__,
            ignored_characters=len(text[end:]),
        )
    return value


def role_call(settings, schema, system, data, thread_id, checkpointer, role, language=None):
    language = language or current_language()
    native = is_deepseek(settings)
    prompt = system + (
        tr("prompt.json_only_line", language)
        + json.dumps(localize_schema(schema.model_json_schema(), language), ensure_ascii=False)
        if native
        else ""
    )
    agent = create_agent(
        model=build_model(settings, json_mode=native),
        response_format=None if native else ToolStrategy(schema, handle_errors=False),
        system_prompt=prompt,
        checkpointer=checkpointer,
    )
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": settings["max_steps"]}
    saved = agent.get_state(config)
    emit(role, "model_started", "等待模型响应", model=settings["model"])
    response = (
        saved.values
        if saved.values and not saved.next
        else agent.invoke(
            None if saved.values else {"messages": [{"role": "user", "content": json.dumps(data, ensure_ascii=False)}]},
            config,
        )
    )
    value = (
        parse_model_response(schema, response["messages"][-1].content, role, language)
        if native
        else response["structured_response"]
    )
    inputs = outputs = 0
    for message in response["messages"]:
        if isinstance(message, AIMessage):
            usage = message.usage_metadata or {}
            inputs += usage.get("input_tokens", 0)
            outputs += usage.get("output_tokens", 0)
    emit(role, "model_completed", "模型已响应", model=settings["model"], input_tokens=inputs, output_tokens=outputs)
    return value.model_dump(), inputs, outputs
