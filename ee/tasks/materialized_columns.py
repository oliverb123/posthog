from collections.abc import Iterator
from celery.utils.log import get_task_logger

from ee.clickhouse.materialized_columns.columns import (
    MaterializedColumn,
    get_on_cluster_clause_for_table,
)
from posthog.client import sync_execute
from posthog.settings import CLICKHOUSE_DATABASE
from posthog.clickhouse.materialized_columns import ColumnName, TablesWithMaterializedColumns

logger = get_task_logger(__name__)


def mark_all_materialized() -> None:
    if any_ongoing_mutations():
        logger.info("There are running mutations, skipping marking as materialized")
        return

    for table, materialized_column in get_materialized_columns_with_default_expression():
        updated_table = "sharded_events" if table == "events" else table
        on_cluster = get_on_cluster_clause_for_table(table)

        sync_execute(
            f"""
            ALTER TABLE {updated_table} {on_cluster}
            MODIFY COLUMN
            {materialized_column.name} {materialized_column.details.get_column_type()}
                MATERIALIZED {materialized_column.details.get_expression()}
            """,
            {"property": materialized_column.details.property_name},
        )


def get_materialized_columns_with_default_expression() -> (
    Iterator[tuple[TablesWithMaterializedColumns, MaterializedColumn]]
):
    tables: list[TablesWithMaterializedColumns] = ["events", "person"]
    for table in tables:
        for materialized_column in MaterializedColumn.get_all(table):
            if is_default_expression(table, materialized_column.name):
                yield table, materialized_column


def any_ongoing_mutations() -> bool:
    running_mutations_count = sync_execute("SELECT count(*) FROM system.mutations WHERE is_done = 0")[0][0]
    return running_mutations_count > 0


def is_default_expression(table: str, column_name: ColumnName) -> bool:
    updated_table = "sharded_events" if table == "events" else table
    column_query = sync_execute(
        "SELECT default_kind FROM system.columns WHERE table = %(table)s AND name = %(name)s AND database = %(database)s",
        {"table": updated_table, "name": column_name, "database": CLICKHOUSE_DATABASE},
    )
    return len(column_query) > 0 and column_query[0][0] == "DEFAULT"
