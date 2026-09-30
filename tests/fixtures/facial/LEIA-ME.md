# Rostos de teste da câmera falsa (30/09/2026)

`rosto-a.y4m` e `rosto-b.y4m` alimentam a câmera falsa do Chromium
(`--use-file-for-fake-video-capture`) no `tests/127-ponto-so-no-tablet.spec.ts`, pra facial
rodar de verdade (detecção + descriptor do face-api), com cliques reais.

- 1 quadro 320×240, YUV 4:2:0 (o Chrome repete o quadro em loop).
- Origem: retratos oficiais da NASA, **domínio público**, via Wikimedia Commons —
  `File:Neil_Armstrong_pose.jpg` (rosto-a) e `File:Buzz_Aldrin.jpg` (rosto-b), recortados no rosto.
- Duas pessoas DIFERENTES de propósito: a (cadastrada) tem que ser reconhecida; b (não
  cadastrada) tem que ouvir "Não reconheci".
