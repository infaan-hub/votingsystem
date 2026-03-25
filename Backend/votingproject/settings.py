import importlib.util
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_list(name, default=""):
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def clean_env_value(name, default=""):
    value = os.getenv(name, default)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1].strip()
    return value


SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "django-insecure-v5nb1^6=_k@x0wnq_joaj++pgz7094%9b8=_)s=*l2kxtx588t",
)

DEBUG = os.getenv("DEBUG", "True").lower() in {"1", "true", "yes", "on"}

ALLOWED_HOSTS = [
    "127.0.0.1",
    "localhost",
    "testserver",
    "votingsystem-1-urbz.onrender.com",
    *env_list("ALLOWED_HOSTS"),
]
if os.getenv("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.getenv("RENDER_EXTERNAL_HOSTNAME"))


INSTALLED_APPS = [
    'corsheaders',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'votingsystem',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
]

if importlib.util.find_spec("whitenoise"):
    MIDDLEWARE.append('whitenoise.middleware.WhiteNoiseMiddleware')

MIDDLEWARE += [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'votingproject.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'votingproject.wsgi.application'
ASGI_APPLICATION = 'votingproject.asgi.application'


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
database_url = clean_env_value("DATABASE_URL", "")
if database_url and importlib.util.find_spec("dj_database_url"):
    import dj_database_url

    DATABASES["default"] = dj_database_url.parse(
        database_url,
        conn_max_age=600,
        ssl_require=os.getenv("DATABASE_SSL_REQUIRE", "True").lower() in {"1", "true", "yes", "on"},
    )


AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Africa/Nairobi'

USE_I18N = True

USE_TZ = True


STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = clean_env_value("MEDIA_URL", "/media/")
if not MEDIA_URL.startswith("/"):
    MEDIA_URL = f"/{MEDIA_URL}"
if not MEDIA_URL.endswith("/"):
    MEDIA_URL = f"{MEDIA_URL}/"
MEDIA_ROOT = Path(clean_env_value("MEDIA_ROOT", str(BASE_DIR / "media")))
if importlib.util.find_spec("whitenoise"):
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }

AUTH_USER_MODEL = 'votingsystem.CustomUser'

CORS_ALLOWED_ORIGINS = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://electionhub-xi.vercel.app',
    *env_list("CORS_ALLOWED_ORIGINS"),
]
CORS_ALLOW_CREDENTIALS = True
if DEBUG and os.getenv("CORS_ALLOW_ALL_ORIGINS", "False").lower() in {"1", "true", "yes", "on"}:
    CORS_ALLOW_ALL_ORIGINS = True

CSRF_TRUSTED_ORIGINS = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://electionhub-xi.vercel.app',
    *env_list("CSRF_TRUSTED_ORIGINS"),
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
GOOGLE_OAUTH_CLIENT_ID = clean_env_value("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = clean_env_value("GOOGLE_OAUTH_CLIENT_SECRET", "")
