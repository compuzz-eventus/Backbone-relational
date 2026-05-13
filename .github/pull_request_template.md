<!-- Merci pour ta contribution ! Quelques infos pour faciliter la review. -->

## Summary

<!-- Un paragraphe : qu'est-ce que cette PR change ? (le pourquoi, pas le quoi
ligne par ligne — la diff suffit pour le quoi) -->

## Type of change

<!-- Coche ce qui s'applique. Conserve les types qui correspondent aux
conventional commits utilisés par release-please. -->

- [ ] `feat` — new feature (user-visible)
- [ ] `fix` — bug fix
- [ ] `perf` — performance improvement
- [ ] `refactor` — internal restructuring, no behavior change
- [ ] `docs` — documentation only
- [ ] `test` — tests only
- [ ] `chore` / `ci` / `build` — tooling, CI, dependencies
- [ ] **BREAKING CHANGE** — coche aussi si la PR casse l'API existante

## Test plan

<!-- Comment as-tu vérifié que ça marche ? Couvre golden path + edge cases.
Si UI change : tester dans un browser. Si lib comportement : ajouter un
test dans test/<area>.js. -->

- [ ] `yarn test` passes locally
- [ ] `yarn lint` passes locally
- [ ] Couverture ne régresse pas (les seuils du job CI doivent passer)
- [ ] (si pertinent) `yarn bench` montre pas de régression perf

## Linked issues

<!-- Closes #N / Refs #M -->

## Notes for reviewers

<!-- Optionnel : zones d'ombre, choix de design à valider, dette à suivre. -->
