# Generated by Django 3.2.19 on 2023-12-12 11:28

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0374_scheduledchange"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="scheduledchange",
            name="operation",
        ),
        migrations.AlterField(
            model_name="scheduledchange",
            name="id",
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
        ),
    ]
