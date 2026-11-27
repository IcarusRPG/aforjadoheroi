import { defineConfig, devices } from '@playwright/test';

const PORTA = 4174;
/** BASE_URL=https://game.icarusrpg.com.br/aforjadoheroi/ testa o site publicado (sem servidor local). */
const EXTERNO = process.env.BASE_URL;

/** Testes e2e de celular contra o build de produção (o mesmo que vai para o GitHub Pages). */
export default defineConfig({
  testDir: 'tests',
  timeout: 360_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // O sonho roda Phaser com WebGL por software (sem GPU): mais de 3 cenas ao mesmo tempo disputam a CPU
  // a ponto de os testes estourarem o tempo.
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: EXTERNO ?? `http://localhost:${PORTA}/aforjadoheroi/`,
    trace: 'retain-on-failure',
  },
  // Jogabilidade (regras, falas, flags) roda só no pixel-7; os testes de layout (etiqueta @layout: tamanho,
  // encaixe na tela, alvos de 44 px) rodam nos 5 aparelhos. Etiquetas por parte: tests/ETIQUETAS.md.
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-13', grep: /@layout/, use: { ...devices['iPhone 13'] } },
    {
      name: 'paisagem-844x390',
      grep: /@layout/,
      use: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } },
    },
    // Fase 5: o celular deitado maior (Pixel 7 na horizontal) e um Android pequeno em pé.
    { name: 'paisagem-915x412', grep: /@layout/, use: { ...devices['Pixel 7 landscape'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } } },
    { name: 'galaxy-s5-360x640', grep: /@layout/, use: { ...devices['Galaxy S5'] } },
  ],
  webServer: EXTERNO ? undefined : {
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/aforjadoheroi/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
