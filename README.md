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
                         #   (декодований payload підписаних запитів -- inline,
                         #   як сусідня <path>/decoded-payload операція)
scalar-docs/
  <service>.json         # ГЕНЕРОВАНО з specs/<service>.yaml (не редагувати):
                         #   той самий документ, уже оброблений Scalar
                         #   (bundle, coercion, навігація) -- саме його
                         #   вантажить index.html, сторінка ~2x швидша
  manifest.json          # sha256 YAML + бандла + index.html для --check
nginx.conf               # референс віддачі: gzip / кеш / CORS
scripts/
  stamp_deploy_badge.sh  # ставить "deployed <час>" у верхній правий кут при деплої
  scalar_prebuild/       # prebuild.mjs: specs/*.yaml -> scalar-docs/*.json
                         #   (синхронізується з api-docs-platform)
.github/workflows/       # preview + env-deploy (обидва кличуть stamp_deploy_badge.sh)
```

Верхній правий кут показує лише **час останнього деплою** (`deployed 14 Sep
15:30`), проставлений `scripts/stamp_deploy_badge.sh` у момент реального
деплою — не з git-історії. Позначки середовища (PROD/DEMO/…) немає: хостнейм
сам про це каже (`docs.` / `docs-demo.` / `docs-preprod.` / `docs-stage.`).

Усі шляхи в `index.html` відносні → сайт працює з будь‑якого шляху на будь‑якому
статичному хості (nginx, CDN, S3, GitHub Pages).

## Віддача (для DevOps)

`nginx.conf` — референс, який відображає вимоги:
- **gzip/brotli** на YAML (файли по кілька МБ) — обов'язково для швидкої передачі;
- `assets/` — immutable‑кеш (контент‑адресований через `?v=`);
- `specs/`, `scalar-docs/` — `no-cache` + `Access-Control-Allow-Origin: *`.

Вибір хостингу (CDN Cloudflare vs self‑hosted статика в периметрі ЕСОЗ) — за
рішенням DevOps. Крок деплою в обох воркфлоу позначено `TODO` — його наповнює
DevOps під обраний хост.

## Оновлення контенту (для авторів / вендора)

Редагуємо OpenAPI напряму (як зараз з Apiary) → перегенеровуємо
`scalar-docs/` (потрібен локальний Chrome):

```
(cd scripts/scalar_prebuild && npm ci) && node scripts/scalar_prebuild/prebuild.mjs . index.html
```

→ PR у гілку‑середовище → технічний письменник рев'ю → CI деплоїть (прев'ю на
коміт, середовище на merge). CI падає, якщо `scalar-docs/` застарів відносно
`specs/`, бандла чи `index.html`.
Конвертація apib→OpenAPI більше не запускається — вона одноразова й живе в
тулінг‑репі `ehealth-ua/api-docs-platform` (`scripts/`).
