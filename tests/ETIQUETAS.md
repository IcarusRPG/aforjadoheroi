# Etiquetas dos testes

Cada teste tem uma etiqueta de **parte do jogo** e, quando confere tamanho ou encaixe na tela, a
etiqueta **`@layout`**.

- **Jogabilidade** (regras, falas, flags, saves) roda só no **pixel-7**.
- **`@layout`** roda nos **5 aparelhos** (pixel-7, iphone-13, paisagem-844x390, paisagem-915x412,
  galaxy-s5-360x640).

## Comandos

| Quando | Comando |
|---|---|
| Mexeu numa parte | `npm run test:parte -- @ato1-p3` |
| Mexeu no Ato I inteiro | `npm run test:parte -- @ato1` |
| Mexeu em CSS ou layout | `npm run test:layout` |
| Só jogabilidade | `npm run test:jogo` |
| **Antes do push (sempre)** | `npm run test:mobile` (tudo) |

## Partes

| Etiqueta | O que cobre |
|---|---|
| `@deploy` | rotas, 404, base `/aforjadoheroi/` |
| `@intro` | abertura e intro (11 passos) |
| `@criacao` | criação do personagem |
| `@sonho` | sonho dos deuses |
| `@cap01` | Capítulo 01: Füllmun, Mirtilo, missões, biblioteca, templo, tragédia |
| `@saves` | salvar, carregar, migrar, exportar |
| `@caderno` | caderno dos deuses |
| `@interface` | dado, menus, pausa, Compêndio, tutorial, horizontal, créditos |
| `@ato1-p1` | Ato I, O alçapão |
| `@ato1-p2` | Ato I, O túnel (e o motor lateral) |
| `@ato1-p3` | Ato I, Os símbolos (tabuleiro da tolerância) |
| `@ato1-p4` | Ato I, O corredor de Sólem |
| `@ato1-p5` | Ato I, A escuridão |
| `@ato1-p6` | Ato I, O Salão da Forja |

Teste novo: `test('título', { tag: ['@ato1-p3'] }, async ({ page }) => …)`, com `'@layout'` na
frente quando ele mede a tela.

## Modo turbo

Com `?test=1` o jogo roda em modo turbo (`src/core/turbo.ts`): texto inteiro na hora, dado sem giro,
trocas de tela de 30 ms e o "pular" dos vídeos liberado em 0,3 s. Teste que mede a própria animação
chama `await devagar(page)` (de `tests/ajudantes.ts`) antes de abrir o jogo.
