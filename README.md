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

## Desktop app ретінде скачать ету

Python орнатпай қолданушылар үшін дайын Windows zip жасауға болады.

### Вариант A: GitHub Actions арқылы дайын zip алу

1. GitHub repo -> `Actions` -> `Build Desktop App` workflow ашыңыз
2. `Run workflow` басыңыз
3. Build біткен соң `Artifacts` ішінен `KazAlerts-Windows` zip жүктеңіз
4. Zip-ті ашып, `KazAlerts.exe` іске қосыңыз

Релизге автомат шығару үшін tag-пен push жасаңыз:

```powershell
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

Сонда GitHub Release-ке `KazAlerts-Windows.zip` тіркеледі.

### Вариант B: Локалда exe build жасау

```powershell
powershell -ExecutionPolicy Bypass -File .\build_desktop.ps1
```

Нәтиже:

- `dist\KazAlerts\KazAlerts.exe` (portable folder)
- `dist\KazAlerts-Windows.zip` (таратуға дайын)

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

## Donor reader -> Firebase direct (free tier)

Енді негізгі режим Cloud Functions-сыз жұмыс істейді: Desktop app Firebase Auth арқылы Firestore-ға тікелей жазады.

Desktop app үшін env:

```powershell
$env:KAZ_ALERTS_FIREBASE_DIRECT="1"
$env:KAZ_ALERTS_FIREBASE_API_KEY="<web-api-key>"
$env:KAZ_ALERTS_FIREBASE_PROJECT_ID="<project-id>"
$env:KAZ_ALERTS_FIREBASE_AUTH_EMAIL="<streamer-email>"
$env:KAZ_ALERTS_FIREBASE_AUTH_PASSWORD="<streamer-password>"
python run.py
```

Desktop UI-да дәл сол `Streamer ID` енгізіңіз.

Web connect flow:

1. `/connect` ашыңыз
2. Firebase Auth арқылы Sign up/Sign in жасаңыз
3. `Streamer profile сақтау` батырмасын басыңыз
4. Сол profile үшін `streamer_id`-ды Desktop app-та қолданыңыз

Терминал қолданбаймын десеңіз:

1. `local.env.example.bat` файлын `local.env.bat` деп көшіріңіз
2. Ішіне `KAZ_ALERTS_FIREBASE_*` мәндерін жазыңыз
3. Кейін тек `start_no_terminal.bat` арқылы іске қосыңыз

Бұл режимде әр донат:
- `streamer_id` бойынша сақталады
- `device_id` бірге жазылады
- analytics (`top day/week/month`, `average`, `repeat`) Firestore-да жаңарады

## Firebase Direct Режим (Email/Password + Firestore)

Бұл free-tier friendly архитектура:

- `web/common.js` - `/api/*` шақыруларын Firestore direct mode-қа ауыстырады
- `app/firebase_direct.py` - Desktop publish-ті Firestore-ға тікелей жібереді
- `firebase/firestore.rules` - owner-only write, public read

Deploy (Spark тарифімен болады):

```powershell
firebase login --no-localhost
firebase deploy --only firestore:rules,firestore:indexes
```

Егер `firebase` командасы табылмаса:

```powershell
npm install -g firebase-tools
```

Толық нұсқаулық: `firebase/README.md`

## Негізгі URL-дар

### Локал (single mode)

```text
http://127.0.0.1:3400/
http://127.0.0.1:3400/connect
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
http://127.0.0.1:3400/s/<streamer_id>/connect
http://127.0.0.1:3400/s/<streamer_id>/widget
http://127.0.0.1:3400/s/<streamer_id>/widgetyt
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_day
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_week
http://127.0.0.1:3400/s/<streamer_id>/stats?board=top_month
http://127.0.0.1:3400/s/<streamer_id>/goal
http://127.0.0.1:3400/s/<streamer_id>/api/analytics/summary
```

## Legacy Cloud API endpoint-тер (optional)

Ескі backend mode керек болса ғана қолданылады (`python run_web.py`):

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

Жоба ішінде desktop reader (PySide6 + UIAutomation) және web overlay бар.

- Desktop reader бөлігі Vercel-де жүрмейді (ол Windows desktop app).
- Web overlay Vercel-де таза static ретінде жүреді.
- `/api/*` шақырулары web/common.js ішінде Firestore direct mode-қа ішкі түрде ауысады (proxy қажет емес).

Қадамдар:

1. Vercel-де осы GitHub репоны импорттаңыз.
2. `Root Directory` ретінде `web` таңдаңыз (немесе root vercel.json қолдансаңыз, root-та қалдырыңыз).
3. `web/firebase-config.js` ішінде `window.KAZ_FIREBASE_DIRECT_MODE = true` екеніне көз жеткізіңіз.
4. Deploy жасаңыз.
5. Vercel Project Settings -> Domains арқылы өз доменіңізді қосыңыз.

Domain үшін `KAZ_ALERTS_PUBLIC_BASE_URL` орнатыңыз:

```powershell
$env:KAZ_ALERTS_PUBLIC_BASE_URL="https://your-domain.com"
```

Сонда admin-дағы generated OBS link-тер доменмен шығады.

## Домен берілгенде қалай жұмыс істейді

Мысал flow:

1. Көрермен/OBS мына URL ашады: `https://your-domain.com/s/streamer123/widget`
2. Frontend path-тан `streamer123` контекстін оқиды.
3. Web ішіндегі `/api/...` сұраулары common.js арқылы Firestore direct handler-ге түседі.
4. Firestore-дан `streamer_id` scope бойынша settings/donation/analytics алынады.

Нәтиже: бір доменде көп streamer қатар жұмыс істейді, әрқайсысының өз профилі, баптауы, аналитикасы бөлек.

## Көп стример толық изоляция (бірінің донаты біріне кетпейді)

Production-та мына ережені ұстаныңыз:

1. Әр стример тек өз scoped URL-ын қолданады:
  - `/s/<streamer_id>/`
  - `/s/<streamer_id>/widget`
  - `/s/<streamer_id>/stats?board=top_day`
2. Firestore rules owner-only write болсын (`firebase/firestore.rules` осыны жасайды).
3. Әр стример `/connect` бетінде өз email/password-пен кіріп, profile сақтайды.
4. Desktop reader сол стримердің `KAZ_ALERTS_FIREBASE_AUTH_EMAIL/PASSWORD` + `Streamer ID` комбинациясымен жүреді.
5. Root URL (`/widget`, `/stats`) емес, тек scoped URL пайдаланыңыз.

Осы конфигурацияда write access тек owner аккаунтқа тиесілі, сондықтан дерек араласпайды.

## Терминалсыз іске қосу

### Локалда (Windows)

1. Бір рет `local.env.example.bat` -> `local.env.bat` деп көшіріңіз.
2. `local.env.bat` ішінде мынаны толтырыңыз:
  - `KAZ_ALERTS_STREAMER_ID=<сіздің streamer id>`
  - `KAZ_ALERTS_AUTOSTART=1`
  - `KAZ_ALERTS_FIREBASE_DIRECT=1`
  - `KAZ_ALERTS_FIREBASE_API_KEY=<firebase web api key>`
  - `KAZ_ALERTS_FIREBASE_PROJECT_ID=<firebase project id>`
  - `KAZ_ALERTS_FIREBASE_AUTH_EMAIL=<streamer email>`
  - `KAZ_ALERTS_FIREBASE_AUTH_PASSWORD=<streamer password>`
3. Егер Python-пен жұмыс істесеңіз: `start_no_terminal.bat` файлын екі рет басыңыз.
4. Егер дайын build-пен жұмыс істесеңіз: `KazAlerts.exe` іске қосыңыз.
5. Программа Streamer ID-ды есіне сақтайды, келесі жолы қайта жазу міндетті емес.

Автоқосу керек болса:

1. `Win + R` басыңыз
2. `shell:startup` жазыңыз
3. Ашылған Startup папкасына `start_no_terminal.bat` немесе `KazAlerts.exe` shortcut-ын салыңыз

Немесе shortcut-ты автомат жасау үшін:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_startup_shortcut.ps1
```

Бұл скрипт `KazAlerts.exe` бар болса соны, болмаса `start_no_terminal.bat`-ты автоқосуға тіркейді.

Сонда Windows қосылған сайын программа автомат ашылады.

### Бұлтта (әрқашан қосулы режим)

- Vercel static hosting + Firestore direct mode комбинациясын қолданыңыз.
- Қосымша backend сервис міндетті емес.
- Desktop reader бөлігі streamer компьютерінде локал қосылады (немесе бөлек Windows VM/PC).

## Қысқаша архитектура flow

1. Desktop app Phone Link-тен Kaspi хабарламаны оқиды.
2. Parser донатты бөледі, dedupe тексереді, local DB-ға жазады.
3. Firebase direct қосулы болса, donation Firestore-ға тікелей жазылады.
4. Firestore ішінде analytics және leaderboard құжаттары жаңартылады.
5. Streamer route widget-тері (`/s/<id>/widget`, `/stats`, `/goal`) сол профиль дерегін тікелей Firestore-дан тартады.
