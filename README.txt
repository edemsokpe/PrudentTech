PRUDENT TECH ACADEMY - STATIC WEBSITE
=========================================
This website uses only:
- HTML
- CSS
- Vanilla JavaScript

No React, no React build tools, and no framework are required.

FILES
-----
index.html      Home
about.html      About Us
services.html   Services
work.html       Our Work
academy.html    Academy
why-us.html     Why Choose Us
faq.html        FAQ
contact.html    Contact
style.css       Main stylesheet
script.js       Navigation, FAQ, animations and contact form (sends to the API)
config.js       Backend address used by the website and admin dashboard
admin/          Admin dashboard (login.html, index.html, admin.css, admin.js)
backend/        FastAPI + PostgreSQL backend
assets/         Supplied logo and flyer

HOW TO VIEW
-----------
Run the backend (see below) and open http://localhost:8000
(Opening index.html directly still shows the pages, but the contact form needs the backend.)

CONTACT FORM, BACKEND AND ADMIN DASHBOARD
-----------------------------------------
Every contact form submission (name, email, phone, service, message, plus time, IP address and
browser) is saved in PostgreSQL and shown in the admin dashboard.

ONE-TIME SETUP (Windows; on macOS/Linux use "source venv/bin/activate")
1. Create the database in PostgreSQL:   CREATE DATABASE prudent_tech;
2. Open a terminal in the backend folder:
      cd backend
      python -m venv venv
      venv\Scripts\activate
      pip install -r requirements.txt
3. Copy .env.example to .env and fill in:
      DATABASE_URL    your PostgreSQL user/password
      SECRET_KEY      python -c "import secrets; print(secrets.token_urlsafe(48))"
      ADMIN_USERNAME / ADMIN_PASSWORD   your first admin login (created on first start)

RUN
      cd backend
      venv\Scripts\activate
      uvicorn app.main:app --reload
   Website:          http://localhost:8000
   Admin dashboard:  http://localhost:8000/admin/
   API docs:         http://localhost:8000/docs

ADD OR RESET AN ADMIN
      python create_admin.py

HOSTING THE WEBSITE SEPARATELY
   If the website files are hosted somewhere other than the FastAPI server, set window.API_BASE
   in config.js to the API address and add the website address to CORS_ORIGINS in backend/.env.
