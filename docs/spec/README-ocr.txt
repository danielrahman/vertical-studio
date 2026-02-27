

===== PAGE 1 =====

README

Vertical Studio

Automated website generation system for boutique developers

Vertical Studio transforms structured company data into professional, deployable websites using a data-driven
approach. Built for speed, scale, and quality.

# Quick Start

# Install dependencies
npm install

# Generate a website from sample data
npm run generate samples/all-new-development-input. json

# Run the pipeline for multiple companies
npm run pipeline

G Project Structure

vertical-studio/

F engine/ # Core generation engine

| / generator. js # Main generator (validates, processes, individualizes)
| — pipeline. js # Batch processing for multiple companies

-— schemas/ # JSON Schema definitions

| \— web-generation-v1. json

/_ samples/ # Sample input data

| F all-new-development-input . json

| ‘— castle-rock-input. json

-— build-output/ # Generated outputs (gitignored)
-— package. json

‘— README .md

‘\ How It Works

1. Input: Structured JSON

Each company is represented as a JSON file following web-generation-v1.json schema:


===== PAGE 2 =====

"meta": {
“companyName": "ALL New Development",
“brandSlug": "“and-development",
“primaryColor": { "hex": "#222d51" },
“fontPrimary": { "family": "Playfair Display" }
3,
"brand": {
"tagline": "Butikovd developerskd spoleénost",
"valueProps": [...]

3,

"sections": [...],
"projects": [...],
"team": [...]

2. Process: Generation Pipeline
Input JSON + Validate » Map to Config » Individualize + Generate Output

Validation: Validates against JSON Schema

Mapping: Transforms raw data into site/ theme configs

Individualization: Applies brand personality (tone, typography, layout)
Output: Generates site-config.json, theme-config.json, React code, sales email

3. Output: Deployable Artifacts

Each generated site includes:

File Description

site-config. json Structured site data (sections, projects, team)
theme-config. json Design tokens (colors, fonts, spacing)

Site. jsx React component code

sales-email.txt Personalized outreach email

SPEC.md Design specification document

® Individualization

The engine automatically adapts the design based on brand personality:


===== PAGE 3 =====

Tone Typography

formal Playfair Display (serif)
warm Inter (sans-serif)
professional Mixed

playful Inter

hl Sample Output

Generated for All New Development

Layout
Centered hero
Left-aligned
Balanced

Dynamic

Preview URL: https: //preview. doanything.app/and-deveLopment

Style

Sharp corners
Rounded corners
Standard

Extra rounded

Sections: 9 (Hero, Value Props, Portfolio, Process, Team, Testimonials, Stats, CTA, Contact)

Projects: 3 (Vila ROQUE, Villa GALLERY, Vila EPOQUE)

Team: 3 members

Individualization: Professional tone > Serif headings + sharp corners

Generated for Castle Rock Investments

Preview URL: https: //preview.doanything.app/castle-rock

Sections: 6

Individualization: Formal tone > Centered hero + classic typography

‘& Integration Points

Data Sources (for automation)

Web scraping (company website)
ARES/Obchodni rejstiik (company registry)
Google Maps (location data)

Social media APIs

Output Targets

Vercel (preview deployments)
Netlify (static hosting)
WordPress (via REST API)
Custom Next.js build

// Metrics


===== PAGE 4 =====

Metric Target

Generation time < 5 seconds
Preview-to-Call rate 30%
Call-to-Contract rate 50%
Monthly capacity 100+ sites

* Development

# Install
npm install

# Run tests
npm test

# Validate a sample
npm run validate samples/all-new-development-input. json

# Generate single site
npm run generate samples/all-new-development-input. json build-output/

# Batch generate
npm run pipeline

7 License

MIT

2£ Author

Richard Malek
; ;
