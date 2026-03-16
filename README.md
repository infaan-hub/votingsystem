# Smart Campus Election System

University voting and election management system built with Django and React.

## Stack

- Backend: Django, Django REST Framework, Token Authentication, SQLite for development
- Frontend: React, React Router, Vite
- Real-time updates: Server-Sent Events from Django for live statistics and rankings

## Backend setup

From [Backend](C:/Users/Hp/OneDrive/Desktop/Voting-system/Backend):

```powershell
.\myvenv\Scripts\python.exe -m pip install -r requirements.txt
.\myvenv\Scripts\python.exe manage.py migrate
.\myvenv\Scripts\python.exe manage.py seed_demo
.\myvenv\Scripts\python.exe manage.py runserver
```

The Django project is `votingproject` and the app is `votingsystem`.

## Frontend setup

From [Frontend](C:/Users/Hp/OneDrive/Desktop/Voting-system/Frontend):

```powershell
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/media` to `http://127.0.0.1:8000`.

## Demo accounts

- Admin: `admin` / `Admin123!`
- Student voter/candidate: `student_a` / `Pass1234!`
- Student voter/candidate: `student_b` / `Pass1234!`
- Staff voter/candidate: `staff_a` / `Pass1234!`
- Staff voter/candidate: `staff_b` / `Pass1234!`

## Implemented features

- Role-aware users for students, staff, officers, and admins
- Election scheduling with campaign and voting windows
- Department and section scoped leadership positions
- Candidate campaign profiles with slogans and manifestos
- One-vote-per-position enforcement
- Live turnout, rankings, and winner summaries
- React pages for overview, campaigns, voting, login, and results
- Django admin management and a demo data seed command
"# votingsystem" 
