from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("votingsystem", "0006_candidate_campaign_video_file"),
    ]

    operations = [
        migrations.AddField(
            model_name="candidate",
            name="campaign_video_content_type",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="candidate",
            name="campaign_video_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="candidate",
            name="campaign_video_filename",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="candidate",
            name="photo_content_type",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="candidate",
            name="photo_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="candidate",
            name="photo_filename",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="election",
            name="image_content_type",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="election",
            name="image_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="election",
            name="image_filename",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
