from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import timedelta
from typing import Literal, NamedTuple, cast
from collections.abc import Callable

from clickhouse_driver.errors import ServerException
from django.utils.timezone import now

from posthog.clickhouse.kafka_engine import trim_quotes_expr
from posthog.clickhouse.materialized_columns import ColumnName, TablesWithMaterializedColumns
from posthog.client import sync_execute
from posthog.models.property import PropertyName, TableColumn, TableWithProperties
from posthog.models.utils import generate_random_short_suffix
from posthog.settings import CLICKHOUSE_CLUSTER, CLICKHOUSE_DATABASE, TEST

DEFAULT_TABLE_COLUMN: Literal["properties"] = "properties"

SHORT_TABLE_COLUMN_NAME = {
    "properties": "p",
    "group_properties": "gp",
    "person_properties": "pp",
    "group0_properties": "gp0",
    "group1_properties": "gp1",
    "group2_properties": "gp2",
    "group3_properties": "gp3",
    "group4_properties": "gp4",
}


class MaterializedColumn(NamedTuple):
    name: ColumnName
    details: MaterializedColumnDetails

    @staticmethod
    def get_all(table: TablesWithMaterializedColumns) -> Iterator[MaterializedColumn]:
        rows = sync_execute(
            """
            SELECT name, comment
            FROM system.columns
            WHERE database = %(database)s
                AND table = %(table)s
                AND comment LIKE '%%column_materializer::%%'
                AND comment not LIKE '%%column_materializer::elements_chain::%%'
        """,
            {"database": CLICKHOUSE_DATABASE, "table": table},
        )

        for name, comment in rows:
            yield MaterializedColumn(name, MaterializedColumnDetails.from_column_comment(comment))

    @staticmethod
    def get(table: TablesWithMaterializedColumns, column_name: ColumnName) -> MaterializedColumn:
        # TODO: It would be more efficient to push the filter here down into the `get_all` query, but that would require
        # more a sophisticated method of constructing queries than we have right now, and this data set should be small
        # enough that this doesn't really matter (at least as of writing.)
        columns = [column for column in MaterializedColumn.get_all(table) if column.name == column_name]
        match columns:
            case []:
                raise ValueError("column does not exist")
            case [column]:
                return column
            case _:
                # this should never happen (column names are unique within a table) and suggests an error in the query
                raise ValueError(f"got {len(columns)} columns, expected 0 or 1")

    @staticmethod
    def find(
        table: TablesWithMaterializedColumns,
        predicate: Callable[[MaterializedColumn], bool],
    ) -> MaterializedColumn | None:
        for column in MaterializedColumn.get_all(table):
            if predicate(column):
                return column
        return None


@dataclass(frozen=True)
class MaterializedColumnDetails:
    table_column: TableColumn
    property_name: PropertyName
    is_disabled: bool

    COMMENT_PREFIX = "column_materializer"
    COMMENT_SEPARATOR = "::"
    COMMENT_DISABLED_MARKER = "disabled"

    def get_column_comment(self) -> str:
        bits = [self.COMMENT_PREFIX, self.table_column, self.property_name]
        if self.is_disabled:
            bits.append(self.COMMENT_DISABLED_MARKER)
        return self.COMMENT_SEPARATOR.join(bits)

    def get_column_type(self) -> str:
        return "String"

    def get_expression(self) -> str:
        # XXX: assumes `property` is being provided as a parameter to the query
        return trim_quotes_expr(f"JSONExtractRaw({self.table_column}, %(property)s)")

    @classmethod
    def from_column_comment(cls, comment: str) -> MaterializedColumnDetails:
        match comment.split(cls.COMMENT_SEPARATOR, 3):
            # Old style comments have the format "column_materializer::property", dealing with the default table column.
            case [cls.COMMENT_PREFIX, property_name]:
                return MaterializedColumnDetails(DEFAULT_TABLE_COLUMN, property_name, is_disabled=False)
            # Otherwise, it's "column_materializer::table_column::property" for columns that are active.
            case [cls.COMMENT_PREFIX, table_column, property_name]:
                return MaterializedColumnDetails(cast(TableColumn, table_column), property_name, is_disabled=False)
            # Columns that are marked as disabled have an extra trailer indicating their status.
            case [cls.COMMENT_PREFIX, table_column, property_name, cls.COMMENT_DISABLED_MARKER]:
                return MaterializedColumnDetails(cast(TableColumn, table_column), property_name, is_disabled=True)
            case _:
                raise ValueError(f"unexpected comment format: {comment!r}")


def get_on_cluster_clause_for_table(table: TableWithProperties) -> str:
    return f"ON CLUSTER '{CLICKHOUSE_CLUSTER}'" if table == "events" else ""


def materialize(
    table: TableWithProperties,
    property: PropertyName,
    column_name: ColumnName | None = None,
    table_column: TableColumn = DEFAULT_TABLE_COLUMN,
    create_minmax_index=not TEST,
) -> ColumnName:
    if existing_column := MaterializedColumn.find(
        table, lambda column: column.details.table_column == table_column and column.details.property_name == property
    ):
        if TEST:
            return existing_column.name
        raise ValueError(f"Property already materialized: {existing_column!r}")

    if table_column not in SHORT_TABLE_COLUMN_NAME:
        raise ValueError(f"Invalid table_column={table_column} for materialisation")

    column_details = MaterializedColumnDetails(table_column, property, is_disabled=False)
    if column_name is None:
        column_name = get_unique_name_for_materialized_column(table, column_details)

    create_materialized_column(table, column_name, column_details)

    if create_minmax_index:
        add_minmax_index(table, column_name)

    return column_name


def create_materialized_column(
    table: TableWithProperties,
    column_name: ColumnName,
    column_details: MaterializedColumnDetails,
) -> None:
    on_cluster = get_on_cluster_clause_for_table(table)

    if table == "events":
        sync_execute(
            f"""
            ALTER TABLE sharded_{table} {on_cluster}
            ADD COLUMN IF NOT EXISTS
            {column_name} {column_details.get_column_type()}
                MATERIALIZED {column_details.get_expression()}
        """,
            {"property": column_details.property_name},
            settings={"alter_sync": 2 if TEST else 1},
        )
        sync_execute(
            f"""
            ALTER TABLE {table} {on_cluster}
            ADD COLUMN IF NOT EXISTS
            {column_name} {column_details.get_column_type()}
        """,
            settings={"alter_sync": 2 if TEST else 1},
        )
    else:
        sync_execute(
            f"""
            ALTER TABLE {table} {on_cluster}
            ADD COLUMN IF NOT EXISTS
            {column_name} {column_details.get_column_type()}
                MATERIALIZED {column_details.get_expression()}
        """,
            {"property": column_details.property_name},
            settings={"alter_sync": 2 if TEST else 1},
        )

    sync_execute(
        f"ALTER TABLE {table} {on_cluster} COMMENT COLUMN {column_name} %(comment)s",
        {"comment": column_details.get_column_comment()},
        settings={"alter_sync": 2 if TEST else 1},
    )


def update_column_is_disabled(table: TablesWithMaterializedColumns, column_name: str, is_disabled: bool) -> None:
    details = replace(
        MaterializedColumn.get(table, column_name).details,
        is_disabled=is_disabled,
    )

    on_cluster = get_on_cluster_clause_for_table(table)
    sync_execute(
        f"ALTER TABLE {table} {on_cluster} COMMENT COLUMN {column_name} %(comment)s",
        {"comment": details.get_column_comment()},
        settings={"alter_sync": 2 if TEST else 1},
    )


def drop_column(table: TablesWithMaterializedColumns, column_name: str) -> None:
    drop_minmax_index(table, column_name)

    on_cluster = get_on_cluster_clause_for_table(table)
    sync_execute(
        f"ALTER TABLE {table} {on_cluster} DROP COLUMN IF EXISTS {column_name}",
        settings={"alter_sync": 2 if TEST else 1},
    )

    if table == "events":
        sync_execute(
            f"ALTER TABLE sharded_{table} {on_cluster} DROP COLUMN IF EXISTS {column_name}",
            {"property": property},
            settings={"alter_sync": 2 if TEST else 1},
        )


def add_minmax_index(table: TablesWithMaterializedColumns, column_name: ColumnName):
    # Note: This will be populated on backfill
    on_cluster = get_on_cluster_clause_for_table(table)
    updated_table = "sharded_events" if table == "events" else table
    index_name = f"minmax_{column_name}"

    try:
        sync_execute(
            f"""
            ALTER TABLE {updated_table} {on_cluster}
            ADD INDEX {index_name} {column_name}
            TYPE minmax GRANULARITY 1
            """,
            settings={"alter_sync": 2 if TEST else 1},
        )
    except ServerException as err:
        if "index with this name already exists" not in str(err):
            raise

    return index_name


def drop_minmax_index(table: TablesWithMaterializedColumns, column_name: ColumnName) -> None:
    on_cluster = get_on_cluster_clause_for_table(table)

    # XXX: copy/pasted from `add_minmax_index`
    updated_table = "sharded_events" if table == "events" else table
    index_name = f"minmax_{column_name}"

    sync_execute(
        f"ALTER TABLE {updated_table} {on_cluster} DROP INDEX IF EXISTS {index_name}",
        settings={"alter_sync": 2 if TEST else 1},
    )


def backfill_materialized_columns(
    table: TableWithProperties,
    column_names: set[ColumnName],
    backfill_period: timedelta,
    test_settings=None,
) -> None:
    """
    Backfills the materialized column after its creation.

    This will require reading and writing a lot of data on clickhouse disk.
    """

    if len(column_names) == 0:
        return

    selected_columns = {
        column.name: column.details for column in MaterializedColumn.get_all(table) if column.name in column_names
    }
    if missing_columns := (column_names - selected_columns.keys()):
        raise ValueError(f"columns do not exist: {missing_columns!r}")

    updated_table = "sharded_events" if table == "events" else table
    on_cluster = get_on_cluster_clause_for_table(table)

    # Hack from https://github.com/ClickHouse/ClickHouse/issues/19785
    # Note that for this to work all inserts should list columns explicitly
    # Improve this if https://github.com/ClickHouse/ClickHouse/issues/27730 ever gets resolved
    for column_name, column_details in selected_columns.items():
        sync_execute(
            f"""
            ALTER TABLE {updated_table} {on_cluster}
            MODIFY COLUMN
            {column_name} {column_details.get_column_type()}
                DEFAULT {column_details.get_expression()}
            """,
            {"property": column_details.property_name},
            settings=test_settings,
        )

    # Kick off mutations which will update clickhouse partitions in the background. This will return immediately
    assignments = ", ".join(f"{column_name} = {column_name}" for column_name in selected_columns.keys())

    sync_execute(
        f"""
        ALTER TABLE {updated_table} {on_cluster}
        UPDATE {assignments}
        WHERE {"timestamp > %(cutoff)s" if table == "events" else "1 = 1"}
        """,
        {"cutoff": (now() - backfill_period).strftime("%Y-%m-%d")},
        settings=test_settings,
    )


def get_unique_name_for_materialized_column(
    table: TableWithProperties,
    column_details: MaterializedColumnDetails,
) -> ColumnName:
    "Returns a sanitized and unique column name to use for materialized column"

    prefix = "pmat_" if table == "person" else "mat_"

    if column_details.table_column != DEFAULT_TABLE_COLUMN:
        prefix += f"{SHORT_TABLE_COLUMN_NAME[column_details.table_column]}_"
    property_str = re.sub("[^0-9a-zA-Z$]", "_", column_details.property_name)

    existing_materialized_columns = {column.name for column in MaterializedColumn.get_all(table)}
    suffix = ""
    while f"{prefix}{property_str}{suffix}" in existing_materialized_columns:
        suffix = "_" + generate_random_short_suffix()

    return f"{prefix}{property_str}{suffix}"
