# Registrar System — Deployment Guide

## Prerequisites

- Docker Desktop installed
- At least 4GB RAM allocated to Docker

---

## Quick Start

### 1. Clone and enter project

```bash
git clone <repository-url>
cd registrarmain
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — for Docker, set MYSQL_HOST=db
```

### 3. Start all services

```bash
docker compose up -d
```

### 4. Access the application

| Service        | URL                     |
|----------------|-------------------------|
| Main app       | http://localhost        |
| Backend API    | http://localhost:8000   |
| MySQL          | localhost:3306          |
| Redis          | localhost:6379          |

---

## Production Deployment

### 1. Update `.env` for production

```
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com
MYSQL_HOST=db
```

### 2. Use secure secrets

- Generate a strong `DJANGO_SECRET_KEY`
- Use secure database passwords
- Configure SSL certificates (e.g. via a reverse proxy)

### 3. Start production stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> **Note:** `docker-compose.prod.yml` can add production overrides (restart policies, env overrides). Create it as needed.

---

## Common Commands

| Action         | Command                                         |
|----------------|--------------------------------------------------|
| View logs      | `docker compose logs -f`                         |
| Stop services  | `docker compose down`                            |
| Rebuild        | `docker compose up -d --build`                  |
| DB backup      | `docker compose exec db mysqldump -u root -proot_password enrollment_system > backup.sql` |

---

## Architecture

| Component | Technology   | Port |
|-----------|--------------|------|
| Frontend  | React + Vite | 80   |
| Backend   | Django + Gunicorn | 8000 |
| Database  | MySQL 8      | 3306 |
| Cache     | Redis 7      | 6379 |

---

## Troubleshooting

| Issue           | Solution                                   |
|-----------------|--------------------------------------------|
| Port conflicts  | Change port mappings in `docker-compose.yml` |
| Permission errors | Run Docker as administrator              |
| Low memory      | Increase Docker memory allocation          |
| Build fails     | Ensure `MYSQL_HOST=db` in `.env` for Docker |
