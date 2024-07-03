# Generated by Django 4.2.11 on 2024-07-03 13:28

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0433_dashboard_idx_dashboard_deleted_team_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="plugin",
            name="plugin_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("local", "local"),
                    ("custom", "custom"),
                    ("repository", "repository"),
                    ("source", "source"),
                    ("inline", "inline"),
                ],
                default=None,
                max_length=200,
                null=True,
            ),
        ),
    ]
