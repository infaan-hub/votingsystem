from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="auth_provider",
            field=models.CharField(
                choices=[("local", "Local"), ("google", "Google")],
                default="local",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="customuser",
            name="google_id",
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
    ]
