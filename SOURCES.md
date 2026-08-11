# SOURCES.md — Virtual Sperm Race

Citations backing the parameter registry
(`src/race/engine/biologyParameters.js`). Registry entries reference these
by key. Preference order: WHO documents, original research, peer-reviewed
reviews. No consumer health blogs are used as scientific authority.

## Primary sources

- **WHO6** — World Health Organization. *WHO laboratory manual for the
  examination and processing of human semen*, 6th edition. Geneva: WHO;
  2021. <https://www.who.int/publications/i/item/9789240030787>
  — Semen volume, concentration, motility and morphology reference
  distributions. Used strictly as population percentiles.

- **SUAREZ06** — Suarez SS, Pacey AA. Sperm transport in the female
  reproductive tract. *Human Reproduction Update*. 2006;12(1):23–37.
  doi:10.1093/humupd/dmi047.
  <https://academic.oup.com/humupd/article/12/1/23/607817>
  — The backbone review: cervical mucus filtering, uterotubal junction
  selection, the isthmic reservoir and its role in synchronising sperm
  readiness with ovulation, hyperactivation mechanics, orders of magnitude
  for tract attrition ("only a few thousand" reach the tubes).

- **SETTLAGE73** — Settlage DS, Motoshima M, Tredway DR. Sperm transport
  from the external cervical os to the fallopian tubes in women: a time
  and quantitation study. *Fertility and Sterility*. 1973;24(9):655–661.
  <https://pubmed.ncbi.nlm.nih.gov/4737661/>
  — Rapid transport: spermatozoa recovered from the tubes within minutes
  of insemination; small numbers at the ampulla.

- **PMC3749807** — Marín-Briggiler CI, et al. (functional human sperm
  capacitation requires prolonged incubation).
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC3749807/>
  — Hours-scale functional capacitation kinetics in vitro; basis for the
  median ≈ 6 h capacitation-requirement assumption.

- **PMC6001750** — Puga Molina LC, et al. Molecular basis of human sperm
  capacitation. *Frontiers in Cell and Developmental Biology* (via PMC).
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC6001750/>
  — Capacitation signalling, cell-to-cell variability, acrosome-reaction
  coupling; basis for the variance of capacitation timing and premature-AR
  hazard.

- **PNAS95** — Cohen-Dayag A, Tur-Kaspa I, Dor J, Mashiach S, Eisenbach M.
  Sperm capacitation in humans is transient and correlates with
  chemotactic responsiveness to follicular factors. *PNAS*.
  1995;92(24):11039–11043. <https://www.pnas.org/doi/10.1073/pnas.92.24.11039>
  — The 2–12 % chemotactically responsive fraction, the transient
  (~50–240 min) capacitated state, continuous population turnover, and
  capacitation-gated chemotaxis.

- **NLM** — MedlinePlus Medical Encyclopedia: Pregnancy — identifying
  fertile days (article 007015).
  <https://www.nlm.nih.gov/medlineplus/ency/article/007015.htm>
  — The 12–24 h oocyte fertilizability window and days-scale sperm
  survival in the tract (used as the envelope for continuous decay
  models, not as cliffs).

- **KUNZ96** — Kunz G, Beil D, Deininger H, Wildt L, Leyendecker G. The
  dynamics of rapid sperm transport through the female genital tract:
  evidence from vaginal sonography of uterine peristalsis and
  hysterosalpingoscintigraphy. *Human Reproduction*. 1996;11(3):627–632.
  doi:10.1093/HUMREP/11.3.627.
  — Cervico-fundal uterine peristalsis frequency and its role in rapid
  sperm transport; basis for the contraction-wave Poisson process.

- **MIKI13** — Miki K, Clapham DE. Rheotaxis guides mammalian sperm.
  *Current Biology*. 2013;23(6):443–452. doi:10.1016/j.cub.2013.02.007.
  — Positive rheotaxis (turning into flow) as a long-range guidance
  mechanism in the mammalian tract.

- **BAHAT03** — Bahat A, Tur-Kaspa I, Gakamsky A, Giojalas LC, Breitbart H,
  Eisenbach M. Thermotaxis of mammalian sperm cells: a potential
  navigation mechanism in the female genital tract. *Nature Medicine*.
  2003;9(2):149–150. doi:10.1038/nm0203-149.
  — The isthmus→ampulla temperature gradient and weak thermotactic bias
  of capacitated cells.

## Calibrated / repository-internal

- **CALIBRATED** — parameters with no direct measurement (gate
  coefficients, contraction ride fraction, energy costs, reservoir
  suppression factor, oocyte competence probability). Each is calibrated
  so the *end-to-end* behaviour matches the sourced targets above
  (funnel orders of magnitude, first-arrival timing, responsive fraction,
  outcome sensitivity) and is verified by `npm run validate:race`
  (1000-seed Monte Carlo with tolerance checks). Discussion: SCIENCE.md
  §3–4. These carry `confidence: low` in the registry on purpose.

- **REPO** — model-resolution and game-mechanic parameters
  (`kind: 'gameplay'`): cohort/finalist caps, fixed timesteps, horizon,
  arcade rules. No biological claim attached.
