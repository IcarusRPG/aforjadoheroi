/**
 * Modo turbo dos testes: só com `?test=1`. Texto aparece inteiro na hora, o dado não gira, as trocas de
 * tela têm fade de 30 ms e o "pular" dos vídeos libera em 0,3 s. `&lento=1` (ou `window.__fdgLento`, que o
 * ajudante `devagar(page)` dos testes liga) desliga, para os testes que medem a própria animação ou o
 * tempo. No jogo de verdade (sem `?test=1`) nunca liga.
 */
export function turbo(): boolean {
  const q = new URLSearchParams(location.search);
  return q.has('test') && !q.has('lento') && !(window as { __fdgLento?: boolean }).__fdgLento;
}
