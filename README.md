# Nexus Intellect Limited

Static marketing site and lightweight Flask backend for Nexus Intellect Limited.

## What is included

- Premium homepage, business growth page, services, contact, and NextPrep pages.
- Marketplace landing and authenticated marketplace app flow.
- Contact form lead capture via `/api/leads`.
- Production-oriented environment controls for marketplace registration, demo seeding, and mediator account setup.

## Local run

```powershell
python server.py
```

Then open `http://127.0.0.1:5000/`.

## Environment

Copy `.env.example` into your hosting platform settings and provide real values there. Do not commit `.env`, SQLite databases, or generated lead records.

Required for production:

- `NEXUS_ENV=production`
- `SECRET_KEY`

Optional:

- `NEXUS_LEADS_DIR`
- `NEXUS_MARKETPLACE_REGISTRATION`
- `NEXUS_SEED_DEMO_DATA`
- `NEXUS_ADMIN_EMAIL`
- `NEXUS_ADMIN_PASSWORD`
