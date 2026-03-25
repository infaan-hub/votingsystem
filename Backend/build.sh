#!/usr/bin/env bash
set -o errexit

python -m pip install --upgrade pip
pip install -r requirements.txt
mkdir -p "${MEDIA_ROOT:-media}"
python manage.py collectstatic --noinput
python manage.py migrate
