from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0003_normalize_blank_google_ids"),
    ]

    operations = [
        migrations.AddField(
            model_name="candidate",
            name="campaign_video_url",
            field=models.URLField(blank=True),
        ),
    ]
