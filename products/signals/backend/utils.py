import json
from datetime import UTC, datetime
from typing import Union

from posthog.schema import EmbeddingModelName

from posthog.hogql import ast
from posthog.hogql.query import execute_hogql_query

from posthog.api.embedding_worker import emit_embedding_request
from posthog.models import Team

EMBEDDING_MODEL = EmbeddingModelName.TEXT_EMBEDDING_3_SMALL_1536

# Page size for the soft-delete fetch. The query is keyset-paginated on document_id so reports
# with more than one page of signals are fully covered (see soft_delete_report_signals).
SOFT_DELETE_BATCH_SIZE = 5000


def soft_delete_report_signals(report_id: str, team_id: int, team: Team) -> None:
    """
    Soft-delete all ClickHouse signals for a report by re-emitting them with metadata.deleted=True.

    Preserves the original timestamp so each row lands in the same ReplacingMergeTree partition
    and replaces the original. Fetches ALL signals (including already-deleted ones) via keyset
    pagination over document_id, so no signals are missed on large reports or repeated calls.
    """
    query = """
        SELECT
            document_id,
            content,
            metadata,
            timestamp
        FROM (
            SELECT
                document_id,
                argMax(content, inserted_at) as content,
                argMax(metadata, inserted_at) as metadata,
                argMax(timestamp, inserted_at) as timestamp
            FROM document_embeddings
            WHERE model_name = {model_name}
              AND product = 'signals'
              AND document_type = 'signal'
              AND document_id > {after_document_id}
            GROUP BY document_id
        )
        WHERE JSONExtractString(metadata, 'report_id') = {report_id}
        ORDER BY document_id ASC
        LIMIT {batch_size}
    """

    after_document_id = ""
    while True:
        result = execute_hogql_query(
            query_type="SignalsSoftDeleteForReport",
            query=query,
            team=team,
            placeholders={
                "model_name": ast.Constant(value=EMBEDDING_MODEL.value),
                "report_id": ast.Constant(value=report_id),
                "after_document_id": ast.Constant(value=after_document_id),
                "batch_size": ast.Constant(value=SOFT_DELETE_BATCH_SIZE),
            },
        )

        rows = result.results or []
        for row in rows:
            document_id, content, metadata_str, timestamp_raw = row
            metadata = json.loads(metadata_str)
            metadata["deleted"] = True

            emit_embedding_request(
                content=content,
                team_id=team_id,
                product="signals",
                document_type="signal",
                rendering="plain",
                document_id=document_id,
                models=[m.value for m in EmbeddingModelName],
                timestamp=_ensure_tz_aware(timestamp_raw),
                metadata=metadata,
            )

        # A short page means we've exhausted this report's signals. Otherwise advance the keyset
        # cursor to the last document_id (rows are ordered by document_id ASC) and fetch the next page.
        if len(rows) < SOFT_DELETE_BATCH_SIZE:
            break
        after_document_id = rows[-1][0]


def _ensure_tz_aware(value: Union[datetime, str]) -> datetime:
    """Coerce a ClickHouse timestamp (usually a datetime, occasionally a string) to a tz-aware datetime."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value
