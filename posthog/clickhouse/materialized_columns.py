from datetime import timedelta

from posthog.cache_utils import cache_for
from posthog.models.instance_setting import get_instance_setting
from posthog.models.property import PropertyName, TableColumn, TableWithProperties
from posthog.settings import EE_AVAILABLE


ColumnName = str
TablesWithMaterializedColumns = TableWithProperties

if EE_AVAILABLE:
    from ee.clickhouse.materialized_columns.columns import get_materialized_columns
else:

    def get_materialized_columns(
        table: TablesWithMaterializedColumns,
        exclude_disabled_columns: bool = False,
    ) -> dict[tuple[PropertyName, TableColumn], ColumnName]:
        return {}


@cache_for(timedelta(minutes=15))
def get_enabled_materialized_columns(
    table: TablesWithMaterializedColumns,
) -> dict[tuple[PropertyName, TableColumn], ColumnName]:
    if not get_instance_setting("MATERIALIZED_COLUMNS_ENABLED"):
        return {}

    return get_materialized_columns(table, exclude_disabled_columns=True)
