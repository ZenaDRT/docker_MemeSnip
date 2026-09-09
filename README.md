# MemeSnip 🚀

MemeSnip is a dynamic, high-performance meme sharing and snipping web application. This repository is fully containerized with Docker and Docker Compose for seamless local development and production deployment.

---

## 🐳 Quick Start with Docker

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

---

### Option 1: Run with Docker Compose (Recommended)

1. **(Optional) Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   *By default, the application runs on port `8080` (`http://localhost:8080`). You can change `PORT=8080` in `.env` if desired.*

2. **Build and start the container:**
   ```bash
   docker compose up -d --build
   ```

3. **Open the application:**
   - **Main App:** [http://localhost:8080](http://localhost:8080)
   - **Admin Portal:** [http://localhost:8080/admin/](http://localhost:8080/admin/)

4. **Stop the container:**
   ```bash
   docker compose down
   ```

---

### Option 2: Run with Docker CLI

1. **Build the image:**
   ```bash
   docker build -t memesnip .
   ```

2. **Run the container with persistent volumes:**
   ```bash
   docker run -d \
     --name memesnip-app \
     -p 8080:80 \
     -v "$(pwd)/memes:/var/www/html/memes" \
     -v "$(pwd)/avatars:/var/www/html/avatars" \
     memesnip
   ```

3. **Stop & Remove the container:**
   ```bash
   docker stop memesnip-app && docker rm memesnip-app
   ```

---

## ⚙️ Architecture & Storage

- **Base Image:** `php:8.2-apache`
- **Upload Endpoints:**
  - `POST /api/upload.php` — Handles meme uploads (up to 15MB: JPG, PNG, GIF, WEBP, MP4, WEBM).
  - `POST /api/upload_avatar.php` — Handles user avatar uploads (up to 5MB: JPG, PNG, GIF, WEBP).
- **Persistent Storage:**
  - `./memes/` — Mounted to `/var/www/html/memes`
  - `./avatars/` — Mounted to `/var/www/html/avatars`
- **PHP INI Limits:**
  - `upload_max_filesize = 25M`
  - `post_max_size = 30M`
  - `memory_limit = 128M`
  - `max_execution_time = 300`

---

## 🔍 Healthcheck & Verification

Check the running container status:
```bash
docker ps
```
Check container logs:
```bash
docker logs memesnip-app
```
