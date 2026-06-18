# 🚀 Monserv

A professional, self-hosted uptime monitoring solution designed for speed, reliability, and aesthetics. Monitor your servers, websites, and services with real-time updates and instant notifications.

![Monserv Dashboard](https://raw.githubusercontent.com/prem-devv/monserv/master/screenshot.png)

## ✨ Features

- **Multi-Protocol Monitoring**: Support for HTTP/HTTPS, TCP Port, and ICMP Ping.
- **Fast Detection**: Up to 5-second check intervals for critical services.
- **Instant Alerts**: Integrated with Google Chat, Slack, and Discord via Webhooks.
- **Real-time Dashboard**: No-cache polling ensures you see status changes as they happen.
- **Docker-First**: Fully containerized for one-command deployment.
- **Secure Auth**: Built-in authentication via NextAuth.
- **Glassmorphism UI**: High-end cyber-themed design.

---

## 🐳 Deployment via Docker (Recommended)

This is the easiest way to get Monserv up and running in minutes.

### 1. Prerequisites
- Docker and Docker Compose installed.
- A public domain (if hosting on a VPS) or local IP.

### 2. Setup
Clone the repository and enter the directory:
```bash
git clone https://github.com/prem-devv/monserv.git
cd monserv
```

### 3. Launch
Set your environment variables and start the containers. Replace `yourdomain.com` with your actual domain or IP.

**For HTTPS (e.g., behind Caddy/Nginx):**
```bash
PROTOCOL=https SERVER_IP=yourdomain.com PORT_SUFFIX="" docker-compose up -d --build
```

**For Local Access (port 3000):**
```bash
SERVER_IP=localhost docker-compose up -d --build
```

### 4. Admin Access
Open `http://yourdomain.com:3000` (or 443 if using proxy).
- **Default Username**: `admin`
- **Default Password**: `admin`

---

## 🛠️ Deployment via NPM (Local Development)

If you prefer to run it natively on your machine:

### 1. Prerequisites
- Node.js 20+
- npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Build the project
```bash
npm run build
```

### 4. Start the Application
You will need to start the API and Web services separately or use a process manager like PM2.

**Start Backend:**
```bash
cd apps/api
npm start
```

**Start Frontend:**
```bash
cd apps/web
npm start
```

---

## 🔒 Reverse Proxy (Caddy)

If you are using Caddy to handle HTTPS, use this configuration:

```caddyfile
yourdomain.com {
    reverse_proxy localhost:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

## 🛠️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_IP` | Public domain or IP for redirects | `localhost` |
| `PROTOCOL` | `http` or `https` | `http` |
| `PORT_SUFFIX` | Port shown in URL (empty for 80/443) | `:3000` |
| `NEXTAUTH_SECRET` | Secret key for auth | (generated) |

---

## 📄 License

MIT License - feel free to use and modify for your own professional needs.
