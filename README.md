# Voting System

University voting and election management system with:

- Django REST API in [Backend](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Backend)
- React + Vite frontend in [Frontend](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Frontend)

## Local setup

Backend:

```powershell
cd Backend
.\myvenv\Scripts\python.exe -m pip install -r requirements.txt
.\myvenv\Scripts\python.exe manage.py migrate
.\myvenv\Scripts\python.exe manage.py seed_demo
.\myvenv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend:

```powershell
cd Frontend
npm install
npm run dev
```

## Demo accounts

- Admin: `admin` / `Admin123!`
- Student voter/candidate: `student_a` / `Pass1234!`
- Student voter/candidate: `student_b` / `Pass1234!`
- Staff voter/candidate: `staff_a` / `Pass1234!`
- Staff voter/candidate: `staff_b` / `Pass1234!`

## Render deployment

Files added:

- [render.yaml](/c:/Users/Hp/OneDrive/Desktop/Voting-system/render.yaml)
- [build.sh](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Backend/build.sh)
- [Backend/.env.example](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Backend/.env.example)

Backend service settings:

1. Create a new Render Web Service from this repo.
2. Use `Backend` as the root directory.
3. Build command: `./build.sh`
4. Start command: `gunicorn votingproject.wsgi:application`
5. Add environment variables:

```text
SECRET_KEY=...
DEBUG=False
ALLOWED_HOSTS=your-render-service.onrender.com
CORS_ALLOWED_ORIGINS=https://your-frontend-app.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-frontend-app.vercel.app
DATABASE_URL=postgresql://...
DATABASE_SSL_REQUIRE=True
```

Notes:

- [settings.py](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Backend/votingproject/settings.py) now supports environment-based `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, and `DATABASE_URL`.
- `whitenoise`, `gunicorn`, and `dj-database-url` were added in [requirements.txt](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Backend/requirements.txt).

## Vercel deployment

Files added:

- [Frontend/vercel.json](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Frontend/vercel.json)
- [Frontend/.env.production.example](/c:/Users/Hp/OneDrive/Desktop/Voting-system/Frontend/.env.production.example)

Frontend project settings:

1. Create a Vercel project from this repo.
2. Set the root directory to `Frontend`.
3. Framework preset: `Vite`.
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variable:

```text
VITE_API_BASE=https://your-render-service.onrender.com/api
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

Backend Google sign-in variable:

```text
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
```

`vercel.json` rewrites all routes to `index.html`, which is required for React Router routes like:

- `/admin/dashboard`
- `/voter/dashboard`
- `/candidate/campaigndetails`

## API health check

Health endpoint:

- `GET /api/health/`

## Backend test status

Run:

```powershell
cd Backend
.\myvenv\Scripts\python.exe manage.py test
```

The test suite covers auth, elections, campaigns, stats, results, ballot voting, and health.
