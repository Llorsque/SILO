# Shorttrack DataTool (v0)

Deze eerste versie is een **statische webapp** (HTML/CSS/JS) zonder build-step.
Je kunt 'm direct hosten via **GitHub Pages**.

## Wat zit er al in?
- **Upload Excel (.xlsx/.xls)** (eerste sheet wordt gebruikt)
- **Mapping**: koppel jouw kolomkoppen aan velden die de tool gebruikt (rijder, tijd, rank, datum, etc.)
- **Dashboard module**: selecteer een rijder → tiles met kernstats
- **Filters & Parameters**: query builder met combineerbare regels (AND/OR)
- **Head-to-Head**: kies 2–6 rijders, direct overzicht + vergelijkingstabel met "beste/gem/.."
- **Kampioenen**: basislijstgenerator voor Wereld/Olympisch op basis van door jou gekozen kolommen/waarden

## Starten (lokaal)
Open `index.html` in je browser.

> Tip: sommige browsers blokkeren lokale bestandslezing. Als upload niet werkt, gebruik een simpele webserver:

```bash
python -m http.server 8080
```
Ga daarna naar `http://localhost:8080`.

## Deploy via GitHub Pages
1. Zet de bestanden in een repo
2. Settings → Pages → Deploy from branch
3. Kies je branch (bijv. `main`) en `/root`

## Opmerking over data
De data blijft **in de browser** (geen server). Upload is dus lokaal en veilig.

## Roadmap (volgende iteraties)
- Sneller + robuuster (grote bestanden)
- Head-to-Head: duidelijkere verschillen (kolom-per-metric, sorteerbare ranking, mini-bars)
- Champions module: echte logica o.b.v. vaste kolommen (na jouw kolomkoppen)
- Opslaan van mappings per bestand/versie
- Datalaag: Airtable / Supabase (later)
