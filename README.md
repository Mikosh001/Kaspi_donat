# Kaz Alerts

Windows үшін Phone Link ішіндегі Kaspi хабарламаларын оқып, streamer overlay-ға шығаратын жоба.

## Не жаңарды

- Multi-tenant cloud cabinet қосылды: әр streamer-дің жеке профилі бар.
- Streamer scoped web routes: `/s/<streamer_id>/...`.
- Device binding қосылды: донат жіберген құрылғы streamer профиліне байланады.
- Settings sync streamer бойынша бөлек сақталады.
- Donor analytics кеңейді:
  - Top day
  - Top week
  - Top month
  - Average donation
  - Repeat donors

## Орнату

```powershell
cd kaz_alerts
pip install -r requirements.txt
```

## Локал іске қосу

```powershell
cd kaz_alerts
python run.py
```

Бұл команда:
- Desktop donor reader-ді ашады
- Local web server-ді көтереді (`http://127.0.0.1:3400`)

Desktop ішінде `Streamer ID` енгізгеннен кейін:
- `Admin ашу` -> `http://127.0.0.1:3400/s/<streamer_id>/`
- `Widget ашу` -> `http://127.0.0.1:3400/s/<streamer_id>/widget`
- `Top day ашу` -> `http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_day`

Осылайша донатты оқитын программада ID жазсаңыз, бірден сол ID иесінің web route-тарына өтесіз.

## Streamer профильмен жұмыс (Cloud cabinet)

1. Admin-ді streamer route-пен ашыңыз:

```text
http://127.0.0.1:3400/s/<streamer_id>/
```

2. Admin ішіндегі `Cloud cabinet` бөлімінде `Register` басыңыз.

3. Генерацияланған `streamer token` сақталады (браузер localStorage ішінде).

4. Қажет болса `Bind device` басып device-ті профилге бекітіңіз.

5. Осы streamer route ішінде сақталған барлық settings тек сол профильге тиесілі болады (settings sync).

## Donor reader -> Cloud ingest байланыстыру

Desktop donor reader-ден cloud backend-ке жіберу үшін env орнатыңыз:

```powershell
$env:KAZ_ALERTS_API_URL="https://your-domain.com/api/cloud/ingest"
$env:KAZ_ALERTS_API_KEY="<streamer_token>"
python run.py
```

Desktop UI-да дәл сол `Streamer ID` енгізіңіз.

Терминал қолданбаймын десеңіз:

1. `local.env.example.bat` файлын `local.env.bat` деп көшіріңіз
2. Ішіне өз `KAZ_ALERTS_API_URL` және `KAZ_ALERTS_API_KEY` мәндерін жазыңыз
3. Кейін тек `start_no_terminal.bat` арқылы іске қосыңыз

Сонда әр донат:
- `streamer_id` бойынша сақталады
- `device_id` бірге жіберіледі
- профильдің widget-іне түседі

## Негізгі URL-дар

### Локал (single mode)

```text
http://127.0.0.1:3400/
http://127.0.0.1:3400/widget
http://127.0.0.1:3400/widgetyt
http://127.0.0.1:3400/stats?board=top_day
http://127.0.0.1:3400/stats?board=top_week
http://127.0.0.1:3400/stats?board=top_month
http://127.0.0.1:3400/stats?board=last_donation
http://127.0.0.1:3400/goal
http://127.0.0.1:3400/api/analytics/summary
```

### Streamer scoped

```text
http://127.0.0.1:3400/s/<streamer_id>/
http://127.0.0.1:3400/s/<streamer_id>/widget
http://127.0.0.1:3400/s/<streamer_id>/widgetyt
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_day
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_week
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_month
http://127.0.0.1:3400/s/<streamer_id>/goal
http://127.0.0.1:3400/s/<streamer_id>/api/analytics/summary
```

## Cloud API endpoint-тер

- `POST /api/cloud/register`
- `POST /api/cloud/rotate-token`
- `POST /api/cloud/bind-device`
- `POST /api/cloud/ingest`
- `GET /api/cloud/profile?streamer_id=...`
- `GET /api/cloud/settings?streamer_id=...`
- `POST /api/cloud/settings?streamer_id=...`

## GitHub-қа салу

```powershell
cd kaz_alerts
git config --global --add safe.directory "C:/Users/berdi/Desktop/Каспи донат/kaz_alerts"
git add .
git commit -m "feat: multi-tenant cloud cabinet and donor analytics"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Ескерту:
- `gh` CLI міндетті емес, кәдімгі `git` жеткілікті.
- Бұл репода `.gitignore` қосылған, сондықтан runtime `data/*` файлдары GitHub-қа кетпейді.

## Vercel-ге қосу

Жоба ішінде desktop reader (PySide6 + UIAutomation) және Python HTTP backend бар.

- Desktop reader бөлігі Vercel-де жүрмейді (ол Windows desktop app).
- Cloud web/API бөлігін production-да әрқашан қосулы backend ретінде шығару керек (Render/Railway/VPS).
- Vercel-ді static front + API proxy/domain қабаты ретінде пайдалануға болады.

Қадамдар:

1. Алдымен Python backend-ті Render/Railway/VPS-қа шығарыңыз.
   - Start command: `python run_web.py`
  - Репода `Procfile` бар (`web: python run_web.py`)
   - Міндетті env:
     - `KAZ_ALERTS_WEB_HOST=0.0.0.0`
  - `KAZ_ALERTS_ENFORCE_STREAMER_SCOPE=1`
     - `KAZ_ALERTS_PUBLIC_BASE_URL=https://your-domain.com` (немесе backend домені)
     - `KAZ_ALERTS_DATABASE_URL=...` (production database)
2. Vercel-де осы GitHub репоны импорттаңыз.
3. `Root Directory` ретінде `web` таңдаңыз.
4. `web/vercel.json` ішіндегі мына жолды өз backend URL-ыңызға ауыстырыңыз:

```json
{ "source": "/api/:path*", "destination": "https://replace-me-backend-domain.example/api/:path*" }
```

5. Deploy жасаңыз.
6. Vercel Project Settings -> Domains арқылы өз доменіңізді қосыңыз.

Domain үшін `KAZ_ALERTS_PUBLIC_BASE_URL` орнатыңыз:

```powershell
$env:KAZ_ALERTS_PUBLIC_BASE_URL="https://your-domain.com"
```

Сонда admin-дағы generated OBS link-тер доменмен шығады.

## Домен берілгенде қалай жұмыс істейді

Мысал flow:

1. Көрермен/OBS мына URL ашады: `https://your-domain.com/s/streamer123/widget`
2. Frontend path-тан `streamer123` контекстін оқиды.
3. API шақырулар `/api/...` арқылы сол доменде жасалады.
4. Vercel rewrite бұл API сұрауларын backend-ке проксилейді.
5. Backend `streamer_id` бойынша нақты профильдің settings/donation/analytics дерегін қайтарады.

Нәтиже: бір доменде көп streamer қатар жұмыс істейді, әрқайсысының өз профилі, баптауы, аналитикасы бөлек.

## Көп стример толық изоляция (бірінің донаты біріне кетпейді)

Production-та мына ережені ұстаныңыз:

1. Әр стример тек өз scoped URL-ын қолданады:
  - `/s/<streamer_id>/`
  - `/s/<streamer_id>/widget`
  - `/s/<streamer_id>/stats?board=top_day`
2. Backend env-та `KAZ_ALERTS_ENFORCE_STREAMER_SCOPE=1` міндетті.
3. Әр стример admin-да бір рет `Register` жасайды және жеке token алады.
4. Әр стример desktop reader-інде өз token-ын ғана қолданады:
  - `KAZ_ALERTS_API_URL=https://your-domain.com/api/cloud/ingest`
  - `KAZ_ALERTS_API_KEY=<осы стримердің token-ы>`
5. Root URL (`/widget`, `/stats`) емес, тек scoped URL пайдаланыңыз.

Осы конфигурацияда API сұраулар streamer scope және token арқылы тексеріледі, сондықтан дерек араласпайды.

## Терминалсыз іске қосу

### Локалда (Windows)

1. Бір рет `local.env.example.bat` -> `local.env.bat` деп көшіріңіз.
2. `local.env.bat` ішінде мынаны толтырыңыз:
  - `KAZ_ALERTS_STREAMER_ID=<сіздің streamer id>`
  - `KAZ_ALERTS_AUTOSTART=1`
  - `KAZ_ALERTS_API_URL=https://your-domain.com/api/cloud/ingest`
  - `KAZ_ALERTS_API_KEY=<сіздің token>`
3. `start_no_terminal.bat` файлын екі рет басыңыз.
4. Скрипт `pythonw` арқылы `run.py` іске қосады, терминал шықпайды.
5. Программа Streamer ID-ді есіне сақтайды, келесі жолы қайта жазу міндетті емес.

Автоқосу керек болса:

1. `Win + R` басыңыз
2. `shell:startup` жазыңыз
3. Ашылған Startup папкасына `start_no_terminal.bat` shortcut-ын салыңыз

Немесе shortcut-ты автомат жасау үшін:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_startup_shortcut.ps1
```

Сонда Windows қосылған сайын программа автомат ашылады.

### Бұлтта (әрқашан қосулы режим)

- Backend-ті Render/Railway/VPS-та Web Service ретінде қосасыз.
- Қызмет үнемі online тұрады, терминал ашып отыру керек емес.
- Desktop reader бөлігі streamer компьютерінде локал қосылады (немесе бөлек Windows VM/PC).

## Қысқаша архитектура flow

1. Desktop app Phone Link-тен Kaspi хабарламаны оқиды.
2. Parser донатты бөледі, dedupe тексереді, local DB-ға жазады.
3. Егер `KAZ_ALERTS_API_URL` орнатылса, донат cloud ingest endpoint-ке жіберіледі.
4. Cloud side донатты streamer профиліне сақтайды, device binding жаңартады.
5. Streamer route widget-тері (`/s/<id>/widget`, `/stats`, `/goal`) сол профиль дерегін тартады.
6. Analytics API average/repeat/top day-week-month есептеп береді.
