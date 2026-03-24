from django.db import migrations


def normalize_blank_google_ids(apps, schema_editor):
    CustomUser = apps.get_model("votingsystem", "CustomUser")
    CustomUser.objects.filter(google_id="").update(google_id=None)


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0002_customuser_google_auth_fields"),
    ]

    operations = [
        migrations.RunPython(normalize_blank_google_ids, migrations.RunPython.noop),
    ]
