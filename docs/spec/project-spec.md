# Vertical Studio - Projektová specifikace (normalizovaná)

Tento dokument je pracovní, normalizovaná verze specifikace převzatá z PDF podkladů.
Zdrojové OCR přepisy jsou v tomto adresáři (`*-ocr.txt`).

## 1. Cíl systému

Vertical Studio je engine, který ze strukturovaného JSON vstupu firmy vygeneruje marketingový web pro boutique developery.

Hlavní cíle:
- Generace webu
- Batch pipeline pro více firem
- Kvalitní premium vizuál a individuální variace podle brand personality
- Výstupy připravené pro preview/deploy

## 2. Architektura

### 2.1 Vrstvy
- Input layer: manuální vstup, scraping, company registry, mapové/social zdroje
- Processing layer: validace schema, mapování, individualizace, content enrichment
- Output layer: site config, theme config, React/Next.js artefakty, sales podklady
- Deployment layer: preview deploy, domény, metriky

### 2.2 MVP scope (co má být implementováno hned)
- JSON schema + validace vstupu
- Generator engine
- Individualization (tone -> layout/typografie/styling)
- Výstupy do souborů
- Pipeline přes více JSON vstupů

## 3. Datový model (kanonická verze)

Root objekt obsahuje minimálně:
- `meta`
- `brand`
- `navigation`
- `sections[]`
- `projects[]`
- `team[]`
- `testimonials[]`
- `contact`
- `footer`

### 3.1 `meta`
- `companyName`
- `brandSlug`
- `locale` (kanonicky lowercase)
- `industry`
- `primaryColor`, `secondaryColor`
- `fontPrimary`, `fontSecondary`

### 3.2 `brand`
- `tagline`, `description`, `story`
- `valueProps[]`
- `personality.tone` (`formal|warm|professional|playful`)

### 3.3 Sekce
Podporované typy:
- `hero`
- `value-props`
- `portfolio-preview` / `portfolio-grid`
- `process`
- `team`
- `testimonials`
- `stats`
- `cta-form`
- `contact`
- `about`
- `faq`

## 4. Design a UX standard (boutique developer)

- Hero s premium vizuálem (video nebo high-res image)
- Sticky navigace + jasná primární CTA
- Value proposition (3-4 bloky)
- Portfolio grid
- Proces spolupráce (4 kroky)
- Team a trust proof (reference + statistiky)
- Kontaktní formulář (včetně GDPR checkbox)

### 4.1 Design tokeny
- Primární tmavá (`#1A1A1A` nebo brand navy)
- Sekundární zlatá (`#C9A962`)
- Světlá pozadí (`#FAFAFA`, `#F5F5F0`)
- Serif pro heading, sans pro body

## 5. API návrh (plán)

Navržené endpointy:
- `POST /api/v1/generate`
- `GET /api/v1/generate/{jobId}/status`
- `GET /api/v1/previews`
- `POST /api/v1/deploy`
- `GET /api/v1/analytics`
- `POST /api/v1/companies`
- `GET /api/v1/companies`
- `PUT /api/v1/companies/{id}`

## 6. Roadmapa

- Fáze 1 (MVP): schema, generator, sample data, pipeline
- Fáze 2: extraction + AI content + automatizace
- Fáze 3: scale (multi-tenant, custom domény, dashboard)

## 7. Poznámka k preview

`previewUrl` není součást vstupního business JSON modelu firmy.
Je to runtime/deployment metadata, které má vzniknout až po deploy kroku.

