from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0005_election_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="candidate",
            name="campaign_video",
            field=models.FileField(blank=True, null=True, upload_to="candidate_videos/"),
        ),
    ]
