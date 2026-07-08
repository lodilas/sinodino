# Kommentierte Linkliste

Eine einfache kollaborative Web-App fuer Studierende: Links sammeln, kommentieren,
kategorisieren und spaeter mit AI-gestuetzter Recherche erweitern.

## Stack

- Vite + React fuer das Frontend
- Supabase Auth fuer GitHub-Login
- Supabase Postgres fuer Links, Kategorien, Kommentare und Rollen
- Row Level Security fuer sichere Schreib- und Leserechte
- GitHub Actions fuer den Build-Check

## Lokal starten

PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Danach in `.env.local` eintragen:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Supabase einrichten

1. Neues Supabase-Projekt erstellen.
2. In Supabase unter SQL Editor die Migration ausfuehren:
   `supabase/migrations/20260708150000_initial_schema.sql`
3. Unter Authentication > Providers den GitHub Provider aktivieren.
4. Als Redirect URL fuer lokale Entwicklung eintragen:
   `http://localhost:5173`
5. Projekt-URL und Publishable key aus Settings > API Keys oder aus dem
   Connect-Dialog in `.env.local` kopieren.

Die Supabase-URL ist nicht die Website-URL. Sie sieht ungefaehr so aus:
`https://abcxyz.supabase.co`. Die spaetere GitHub-Pages-Website sieht eher so
aus: `https://githubname.github.io/repository-name/`.

## Moderation

Neue Links werden mit `status = pending` angelegt. Damit sie sichtbar werden,
setzt eine Moderatorin oder ein Moderator den Status in Supabase auf
`published`.

Eine Person kann zur Moderatorin gemacht werden:

```sql
update public.profiles
set role = 'moderator'
where display_name = 'GitHubName';
```

## AI-Erweiterung

Das Schema enthaelt bereits `content_embeddings`. Spaeter kann eine Server
Function:

1. Linkbeschreibungen und Kommentare in Embeddings umwandeln.
2. Aehnliche Inhalte zu einer Nutzerfrage suchen.
3. Die relevantesten Links und Kommentare als Kontext an ein AI-Modell geben.
4. Eine Antwort mit Quellenliste ausgeben.

Wichtig: API Keys fuer AI-Provider gehoeren nie ins Frontend. Nutzt dafuer
Supabase Edge Functions, Vercel Functions oder einen kleinen Backend-Service.

## GitHub Deployment

### GitHub Pages

1. Neues Repository auf GitHub erstellen, z.B. `linkliste`.
2. Diese Projektdateien in das Repository hochladen.
3. In GitHub unter Settings > Secrets and variables > Actions zwei Repository
   Secrets eintragen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. In GitHub unter Settings > Pages bei Build and deployment als Source
   `GitHub Actions` auswaehlen.
5. Auf den Branch `main` pushen. Der Workflow
   `.github/workflows/deploy-pages.yml` baut und veroeffentlicht die App.

Die Website-URL ist danach normalerweise:

```text
https://DEIN-GITHUB-NAME.github.io/REPOSITORY-NAME/
```

Diese URL muss in Supabase unter Authentication > URL Configuration als Site
URL bzw. Redirect URL eingetragen werden. Fuer lokale Entwicklung zusaetzlich:

```text
http://localhost:5173
```

### Vercel oder Netlify

Das Repository enthaelt auch `.github/workflows/build.yml` als reinen
Build-Check. Fuer Vercel oder Netlify:

1. Repository verbinden.
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. Environment Variables setzen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
