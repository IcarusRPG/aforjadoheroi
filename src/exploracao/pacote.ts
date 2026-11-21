/**
 * Porta única da exploração: tudo o que depende do Phaser (motor, efeitos e clima do sonho e o próprio
 * Phaser) entra no jogo por este módulo, num pedaço dinâmico só. O resto (palco, intro, cenas, telas)
 * fica no pacote principal. Um arquivo dinâmico em vez de quatro: menos coisa para faltar depois de
 * um deploy (ver src/core/carregar.ts).
 */
export { default as Phaser } from 'phaser';
export { criarMotor } from './motor';
export { EfeitosSonho } from './efeitosSonho';
export { ClimaSonho } from './climaSonho';
export { abrirEditor } from './editor';
export { Cenario } from './cenario';
