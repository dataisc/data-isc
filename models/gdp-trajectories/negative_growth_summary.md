# Negative & Near-Zero Growth Corrections 2027–2040

## Summary Table

| Country     | 2027   | 2028   | 2029   | 2030   | 2031   | 2032   | Driver                          |
|-------------|--------|--------|--------|--------|--------|--------|---------------------------------|
| Ukraine     | −3.0%  | −1.5%  | +1.5%  | +4.0%  | +5.0%  | +5.5%  | Wartime damage + emigration     |
| Venezuela   | −2.0%  | −1.5%  | −0.5%  | +0.5%  | +1.0%  | +1.5%  | Institutional collapse + oil    |
| Myanmar     | −2.0%  | −1.5%  | −1.0%  | −0.5%  | +0.5%  | +1.5%  | Civil war + military junta      |
| Sudan       | −4.0%  | −3.0%  | −1.0%  | +1.0%  | smooth | smooth | Active conflict                 |
| Argentina   |  0.0%  | −0.5%  | −1.0%  | +0.5%  | +1.0%  | +1.5%  | Debt crisis + Milei austerity   |
| South Korea | +2.2%  | +2.0%  | +1.8%  | +1.7%  | +1.6%  | +1.5%  | Demographic cliff               |
| Bulgaria    | +0.3%  | +0.2%  | +0.1%  | +0.1%  | +0.2%  | +0.2%  | Population collapse + emigration|
| Latvia      | −0.5%  | −0.5%  |  0.0%  | +0.2%  | +0.3%  | +0.3%  | Emigration + demographic loss   |
| Lithuania   | +0.5%  | +0.5%  | +0.5%  | +0.7%  | +0.8%  | +0.8%  | Emigration + slow growth        |
| Belarus     | +0.3%  | +0.3%  | +0.3%  | +0.4%  | +0.5%  | +0.5%  | Sanctions + Russia dependency   |
| Egypt       | +1.6%  | +1.6%  | +1.7%  | +1.7%  | +1.8%  | +1.8%  | Debt distress + currency crisis |

## Tier Classification

### Tier 1 — High Confidence Negative
Countries with strong multi-source consensus for contraction in 2027–2030.

**Ukraine** — War damage and working-age emigration (estimated 6–8M displaced) suppresses GDP
through 2028. IMF/World Bank reconstruction scenarios show recovery beginning 2029–2030,
accelerating to 4–6% as Marshall Plan-style aid flows. 2033–2037 shows reconstruction boom
growth of ~5.6%/yr to re-join the 2038 milestone trajectory.

**Venezuela** — Continued institutional fragility and oil sector decay prevent recovery.
No credible political normalisation path before 2030. Growth floors near zero by 2032
as informal economy stabilises. Recovery contingent on political transition.

**Myanmar** — Economy contracted ~18% 2021–2023 following military coup. Civil war ongoing.
No credible stabilisation before 2031. ADB/World Bank project continued contraction with
recovery only after conflict resolution.

**Sudan** — Active armed conflict since 2023. GDP certain to contract through 2027–2029.
No external financing available under conflict conditions.

### Tier 2 — Stagnation Band (0–1.5%)

**Argentina** — Milei austerity programme 2024–2026 produces contraction; recovery uncertain.
Serial default history with +debt burden limits upside. IMF programme constraints through 2030.

**South Korea** — Fertility rate 0.72 (2023), world's lowest. Workforce will begin shrinking
post-2030. OECD projects deceleration from ~2.5%/yr (2025) to ~1.0%/yr (2040). 2038 milestone
adjusted to 2.12T (from 2.5T) to reflect this structural slowdown. baseGrowthRate recalibrated
to still hit 6.0T by 2100.

**Bulgaria/Latvia** — Population declining >1%/yr. Net emigration structural.
Near-zero GDP growth consistent with OECD/Eurostat projections.

**Belarus** — Under Western sanctions, deeply dependent on Russian economy which itself faces
headwinds. Growth capped at 0–0.5%/yr through 2035.

### Tier 3 — Reduced Excess Optimism

**Egypt** — Reduced from implied ~3–4%/yr to ~1.6–1.8%/yr in 2027–2037.
IMF Article IV projections (2025) show GDP per capita growth negative in 2024–2025
due to currency depreciation and import compression. Recovery to ~2% by late 2030s.

## Population Growth Warning Flags Added

The following countries now have `populationGrowthRate` in seed_data for future
GDP-per-capita tooltip display:

| Country      | Code | Pop Growth Rate |
|--------------|------|----------------|
| Nigeria      | NGA  | 2.5%/yr        |
| DR Congo     | COD  | 3.1%/yr        |
| Tanzania     | TZA  | 2.8%/yr        |
| Ethiopia     | ETH  | 2.4%/yr        |
| Uganda       | UGA  | 3.3%/yr        |
| Pakistan     | PAK  | 2.0%/yr        |
| Egypt        | EGY  | 1.9%/yr        |
| Angola       | AGO  | 3.2%/yr        |
| Mozambique   | MOZ  | 2.7%/yr        |
| Mali         | MLI  | 2.9%/yr        |
| Niger        | NER  | 3.7%/yr        |
| Sudan        | SDN  | 2.4%/yr        |
| Senegal      | SEN  | 2.6%/yr        |
| Guinea       | GIN  | 2.7%/yr        |
| Cameroon     | CMR  | 2.6%/yr        |

Sources: UN World Population Prospects 2024 (medium variant)

## Fixed Constraints Verified
- India $95.1T > China $75.1T > USA $70.1T at 2100 ✓
- China overtakes USA in 2037 ✓
- Japan growthFloor 0.003 unchanged ✓
- No Tier 2 country below −2% in any year ✓
- Haiti/South Sudan not in dataset (not corrected)
