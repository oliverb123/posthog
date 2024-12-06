# Generated by Django 4.2.15 on 2024-11-23 14:49

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0527_project_name_sync"),
    ]

    operations = [
        migrations.AddField(
            model_name="externaldatajob",
            name="pipeline_version",
            field=models.CharField(
                blank=True,
                choices=[("v1-dlt-sync", "v1-dlt-sync"), ("v2-non-dlt", "v2-non-dlt")],
                max_length=400,
                null=True,
            ),
        ),
        migrations.RunSQL(
            """
                UPDATE posthog_externaldatajob
                SET pipeline_version = 'v1-dlt-sync'
                WHERE pipeline_version is null
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
