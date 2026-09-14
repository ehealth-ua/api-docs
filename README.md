# eHealth API Docs

Статичний сайт API‑документації ЕСОЗ на базі [Scalar](https://github.com/scalar/scalar)
(зафіксована вендерована версія `1.62.9-ehealth-custom`). Самодостатній: жодних
зовнішніх залежностей під час віддачі.

## Модель гілок = середовища

Кожна гілка — окреме середовище й деплоїться на власний хост. Гілка містить
повний набір специфікацій **свого** середовища.

| Гілка | Середовище | Docs URL |
|---|---|---|
| `main` | PROD | https://docs.ehealth.gov.ua |
| `preprod` | PREPROD | https://docs-preprod.ehealth.gov.ua |
| `demo` | DEMO | https://docs-demo.ehealth.gov.ua |
| `stage` | STAGE | https://docs-stage.ehealth.gov.ua |

Прев'ю з PR: `https://docs-<env><PR-number>.ehealth.gov.ua` (напр. PR 157 у гілку
`demo` → `docs-demo157.ehealth.gov.ua`).

## Структура

```
index.html               # єдина Scalar-оболонка, віддається на /
assets/
  scalar.standalone.js   # pinned рендерер (?v=<base>-ehealth-custom.<sha256:8>,
                         #   base = версія апстріму, з якої форкнулись, статична;
                         #   хеш — від вмісту файлу, міняється на кожен реальний
                         #   білд і б'є кеш (assets/ кешується Cache-Control:
                         #   immutable на рік у nginx.conf))
  fonts/                 # e-Ukraine
specs/
  <service>.yaml         # OpenAPI 3.1 кожного сервісу цього середовища
  signed-payloads/       # декодовані підписані контенти (частина specs)
nginx.conf               # референс віддачі: gzip / кеш / CORS
.github/workflows/       # preview + env-deploy
```

Усі шляхи в `index.html` відносні → сайт працює з будь‑якого шляху на будь‑якому
статичному хості (nginx, CDN, S3, GitHub Pages).

## Віддача (для DevOps)

`nginx.conf` — референс, який відображає вимоги:
- **gzip/brotli** на YAML (файли по кілька МБ) — обов'язково для швидкої передачі;
- `assets/` — immutable‑кеш (контент‑адресований через `?v=`);
- `specs/` — `no-cache` + `Access-Control-Allow-Origin: *`.

Вибір хостингу (CDN Cloudflare vs self‑hosted статика в периметрі ЕСОЗ) — за
рішенням DevOps. Крок деплою в обох воркфлоу позначено `TODO` — його наповнює
DevOps під обраний хост.

## Оновлення контенту (для авторів / вендора)

Редагуємо OpenAPI напряму (як зараз з Apiary) → PR у гілку‑середовище →
технічний письменник рев'ю → CI деплоїть (прев'ю на коміт, середовище на merge).
Конвертація apib→OpenAPI більше не запускається — вона одноразова й живе в
тулінг‑репі `ehealth-ua/api-docs-platform` (`scripts/`).
