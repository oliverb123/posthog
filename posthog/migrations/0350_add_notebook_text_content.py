# Generated by Django 3.2.19 on 2023-09-12 18:09

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0349_update_survey_query_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="notebook",
            name="text_content",
            field=models.TextField(blank=True, null=True),
        ),
    ]
