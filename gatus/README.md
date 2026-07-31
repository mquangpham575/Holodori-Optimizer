# Self-Hosting Gatus Status Page

Gatus is a lightweight developer-oriented service monitoring tool. This directory contains a pre-configured setup to monitor your Hololive Dreams application components.

---

## 1. Local Run / Deployment (Docker Compose)

To spin up the status page locally or on your VPS:

1. Make sure you have **Docker** and **Docker Compose** installed.
2. Navigate to the `gatus/` directory.
3. Run the following command:
   ```bash
   docker compose up -d
   ```
4. Access the status dashboard by opening your browser at:
   ```
   http://localhost:8080
   ```

---

## 2. Configuring Notifications (Alerts)

To receive push notifications immediately when any system goes down, edit `config.yaml` and uncomment the `alerting` section.

### Discord Webhooks
1. Open Discord, go to **Server Settings** -> **Integrations** -> **Webhooks** -> **Create Webhook**.
2. Copy the Webhook URL.
3. Uncomment the `discord` section in `config.yaml` and paste the URL:
   ```yaml
   alerting:
     discord:
       webhook-url: "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
   ```

### Telegram Bot
1. Search `@BotFather` on Telegram, create a new bot, and copy its Access Token.
2. Get your Chat ID using `@userinfobot`.
3. Uncomment the `telegram` section in `config.yaml` and insert them:
   ```yaml
   alerting:
     telegram:
       token: "YOUR_TELEGRAM_BOT_TOKEN"
       chat-id: "YOUR_TELEGRAM_CHAT_ID"
   ```

---

## 3. Customizing Monitored URLs
If you update your production domains (e.g. custom domain for Vercel or different backend host), edit the `url` fields in the `endpoints` list inside `config.yaml`:
- **frontend**: change `https://hololive-dream.vercel.app` to your customized URL.
- **backend-api** & **postgres-database**: change to your updated health endpoint address.
