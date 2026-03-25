from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0004_candidate_campaign_video_url"),
    ]

    operations = [
        migrations.AddField(
            model_name="election",
            name="image",
            field=models.ImageField(blank=True, null=True, upload_to="election_images/"),
        ),
    ]
