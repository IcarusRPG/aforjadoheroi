# Gera src/data/capitulos/ato1.json (Fase 6): as cenas do Ato I — Provação Sob a Luz.
#
#   python scripts/gerar-ato1.py
#
# A Parte 1 (o alçapão) é jogada na tela de cenas; as falas das Partes 2 a 5 aparecem por cima da fase
# lateral e as da Parte 6 por cima do Salão da Forja (todas terminam com "voltar"). Edite os textos aqui
# e rode o script de novo.
import json
import os

V = {"voltar": True}
def N(t, **k): return {"texto": t, **k}
def P(t, **k): return {"quem": "pensamento", "texto": t, **k}
def A(t, **k): return {"quem": "artho", "texto": t, **k}

cenas = []
def cena(id, falas, **k): cenas.append({"id": id, **({} if "fundo" not in k else {"fundo": k.pop("fundo")}), "falas": falas, **k})

VOZES_SONHO = {
    "solem": "Uma voz dourada", "justar": "Uma voz prateada", "ardor": "Uma voz rubra",
    "expiria": "Uma voz azul como o mar", "eternus": "Uma voz branca como estrelas",
    "mentis": "Uma voz cor de âmbar", "irae": "Uma voz violeta de tempestade",
}
FRASES = {
    "solem": "Onde houver escuridão, leve a luz. Mesmo quando ela queimar suas mãos.",
    "justar": "Toda escolha tem peso. Eu ensino a carregá-lo sem cair.",
    "ardor": "Nenhuma corrente é forte o bastante para quem decide ser livre.",
    "expiria": "Eu guardo o último suspiro de todos. Proteja os que ainda não devem partir.",
    "eternus": "Todo fim é um recomeço. Eu vejo o caminho que você ainda não vê.",
    "mentis": "O tempo ensina a quem tem paciência. Pense antes, e vença depois.",
    "irae": "Sua fúria não é fraqueza. Deixe-a ser a tempestade que protege.",
}

# ---------------- Parte 1 · O alçapão se abre ----------------
# Fase 6B: a tragédia continua por baixo do fogo, do trecho mais calmo depois da abertura (34 s, pela
# energia do áudio: a segunda metade é o clímax, mais forte), a 35%. Para com fade de 2 s quando o alçapão
# fecha; o silêncio depois é de propósito. Todas as cenas pedem a mesma faixa: tocando, ela não reinicia.
TRAGEDIA_CALMA = "tragedia@34*0.35"
cena("c1-01", [
    N("Uma mão agarra o seu braço. Forte, trêmula. Artho.",
      ambiente={"som": "fogo-distante", "ganho": 0.35}, ocasional={"som": "madeira-estalando", "ganho": 0.55, "min": 4000, "max": 9000}),
    A("Não! Para dentro! Agora!", bustoHeroi="choque"),
    # Sem som próprio (nada de ordem gritada): só o fogo e os estalos continuam.
    N("Ele te arrasta de volta pelo salão principal. Pelas frestas das janelas, entra um cheiro de fumaça. Lá fora, alguém grita uma ordem numa língua que você não conhece.", bustoHeroi="choque"),
], visual="preto", musica=TRAGEDIA_CALMA, fadeMusica=2000, seguir={"vai_para": "c1-02"})
cena("c1-02", [
    N("Na biblioteca, Artho tira do pescoço uma chave que você nunca viu fora do lugar. As mãos dele tremem.", ambienteGanho=0.2),
    N("A chave gira no cadeado.", som="cadeado-abrindo"),
    N("O cadeado cai no chão.", som="cadeado-cai"),
    N("O alçapão se abre para uma escada de pedra que desce para o escuro."),
    N("Ele acende uma tocha e a coloca na sua mão."),
    A("Desça. Siga o túnel até o fim. Não volte, aconteça o que acontecer."),
], fundo="cena-artho-alcapao-aberto", musica=TRAGEDIA_CALMA, escolhas=[
    {"texto": "“Venha comigo, Artho!”", "efeitos": {"flag": "implorou_artho"}, "vai_para": "c1-02-implorou"},
    {"texto": "“Eu vou lutar! A Nyme…”", "efeitos": {"flag": "quis_lutar"}, "vai_para": "c1-02-lutar"},
    {"texto": "Apertar a tocha e assentir, em silêncio", "efeitos": {"flag": "obedeceu_artho"}, "vai_para": "c1-02-silencio"},
])
cena("c1-02-implorou", [
    {"quem": "heroi", "texto": "Venha comigo, Artho!"},
    A("Meu lugar é aqui. Alguém precisa ganhar tempo."),
], fundo="cena-artho-alcapao-aberto", musica=TRAGEDIA_CALMA, seguir={"vai_para": "c1-02-pronto"})
cena("c1-02-lutar", [
    {"quem": "heroi", "expressao": "raiva", "texto": "Eu vou lutar! A Nyme…"},
    N("Ele segura o seu rosto com as duas mãos.", bustoHeroi="raiva"),
    A("A Nyme escolheu proteger você. Não torne a escolha dela em vão."),
], fundo="cena-artho-alcapao-aberto", musica=TRAGEDIA_CALMA, seguir={"vai_para": "c1-02-pronto"})
cena("c1-02-silencio", [
    N("Você aperta a tocha e assente, em silêncio."),
    A("Bom {menino|menina}."),
], fundo="cena-artho-alcapao-aberto", musica=TRAGEDIA_CALMA, seguir={"vai_para": "c1-02-pronto"})
cena("c1-02-pronto", [
    A("“Quando você estiver {pronto|pronta}”… Lembra? Você está, {nome}. Mais do que imagina."),
], fundo="cena-artho-alcapao-aberto", musica=TRAGEDIA_CALMA, seguir={"vai_para": "c1-03"})
cena("c1-03", [
    N("Ele te empurra escada abaixo."),
    N("O alçapão se fecha sobre a sua cabeça.", som="alcapao-fecha", tremor="leve", musica=None, musicaFade=2000),
    N("Você ouve o cadeado.", som="cadeado-tranca"),
    N("Depois, os passos dele se afastando.", som="passos-afastando"),
    N("Depois, nada.", ambiente=None, ambienteFade=3000, ocasional=None),
    N("Só a tocha. Só você. E o escuro à frente.", pausaAntes=2000, efeitos={"flag": "desceu_alcapao"}),
], visual="tocha-pulso", seguir={"fim": True})

# ---------------- Parte 2 · O túnel (por cima da fase lateral) ----------------
cena("t-inicio", [
    N("Os degraus terminam num túnel úmido. Cheiro de terra e de musgo velho. A tocha estala na sua mão."),
    P("Por que Artho me mandou para cá? Por que eu?"),
], seguir=V)
cena("t-poca", [P("Lá em cima, a vila queima. E eu aqui, fugindo pelo escuro.")], seguir=V)
cena("t-teto", [N("O teto desce tanto que você precisa curvar o corpo para passar.")], seguir=V)
cena("t-memoria", [
    N("Uma lembrança atravessa o escuro, sem pedir licença.", visual="memoria", abafar=True),
    N("Você é pequen{o|a}. Liessa está ajoelhada na porta, de armadura, pronta para partir para Vön Bicken.", visual="memoria", estilo="italico"),
    {"quem": "heroi", "rotulo": "Você (criança)", "texto": "Por que eu não posso ir com vocês?", "visual": "memoria"},
    # Nesta frase, a imagem fica nítida e estável: todos os efeitos param.
    {"quem": "liessa", "rotulo": "Liessa", "texto": "Porque queremos que você tenha certeza do que deseja ser.", "visual": "memoria-nitida"},
    P("E o que eu queria ser…?", visual="memoria"),
    # A imagem se estilhaça (0,8 s) e volta ao túnel.
    P("Eu queria ser forte.", visual="memoria-estilhaca", abafar=False, efeitos={"flag": "memoria_liessa"}),
], fundo="cena-memoria-maes", seguir=V)
cena("t-laje", [N("O chão muda. A terra dá lugar a lajes perfeitas, cortadas por mãos que sabiam o que faziam. Alguém construiu isto. Há muito tempo.")], seguir=V)

# ---------------- Parte 3 · Os símbolos ----------------
cena("s-inscricao", [N("“A luz de Sólem banha todos os caminhos. Quem pisa apenas na própria luz, tropeça nela.”", estilo="inscricao")], seguir=V)
# Fase 6B: a visão e o LEVANTE são separados. A visão vem na primeira flecha que acerta (em qualquer
# um dos dois tabuleiros) ou, sem nenhuma flecha nos dois, no fim do corredor de Sólem, como recompensa.
# O LEVANTE só acontece quando os PV chegam a 0 de verdade (volta com 1 PV; a segunda queda é game over).
cena("s-visao", [
    N("Você está no chão. A dor sobe pela perna. E, por um instante, você se vê, de pé, à sua frente, envolt{o|a} em luz.", bustoHeroi="determinado", aura=True),
    {"quem": "heroi", "rotulo": "Você (a visão)", "expressao": "determinado", "aura": True, "texto": "Se você quer ser forte, continue.", "efeitos": {"flag": "visao_vista"}},
], visual="preto", seguir=V)
cena("s-levante", [
    N("Seus joelhos cedem. O chão de pedra vem ao seu encontro, e tudo escurece."),
    N("Uma voz que não é sua ecoa pelo corredor:"),
    N("LEVANTE!", estilo="levante", tremor="leve", efeitos={"flag": "levantou"}),
], visual="preto", seguir=V)
# O teste de Religião (Fase 6B): a frase antes do dado e a de depois.
cena("s-religiao", [P("Esses símbolos… Artho me fez decorar cada um deles. Você tenta lembrar das aulas."), N("(Religião CD 10)", estilo="teste")], seguir=V)
cena("s-religiao-ok", [P("Sólem, Justar, Ardor, Expiria, Eternus, Mentis, Irae. Você reconhece todos.")], seguir=V)
cena("s-religiao-falha", [P("Os símbolos parecem familiares, mas os nomes fogem da sua memória.")], seguir=V)
cena("s-flecha2", [P("Toda vez que piso no sol… Será que o caminho não é só dele?")], seguir=V)
cena("s-flecha3", [A("Sólem não pede que você o siga sozinho, {nome}.", memoria=True)], seguir=V)
cena("s-solta-visao", [P("Esta laje parece solta…")], seguir=V)
cena("s-solta-audicao", [P("Você ouve um estalo metálico embaixo dela.")], seguir=V)
cena("s-fim", [P("Toda vez que eu pisava só no sol… doía. Os outros caminhos estavam lá o tempo todo.")], seguir=V)

# ---------------- Parte 4 · O corredor de Sólem ----------------
# Fase 6B: o corredor de Sólem é o inverso do primeiro tabuleiro (o caminho certo é o de Sólem).
cena("c-chegada", [
    P("Lá atrás, quem pisava só no sol tropeçava. Mas este corredor é dele. As paredes, as tochas, tudo aqui é de Sólem."),
    P("E se aqui… for o contrário?"),
], seguir=V)
cena("c-primeira", [P("Na casa de Sólem, quem foge da luz se perde no escuro.")], seguir=V)
cena("c-flecha1", [P("A dor veio dos outros caminhos, desta vez. Siga a luz.")], seguir=V)
cena("c-flecha2", [A("Respeitar todos os caminhos não é andar em todos eles, {nome}. Às vezes, a coragem é escolher o seu.", memoria=True)], seguir=V)
cena("c-solta", [P("Esta laje parece solta…")], seguir=V)
cena("c-visao", [
    N("Por um instante, você se vê à sua frente, de pé, envolt{o|a} em luz.", bustoHeroi="determinado", aura=True),
    {"quem": "heroi", "rotulo": "Você (a visão)", "expressao": "determinado", "aura": True, "texto": "Se você quer ser forte, continue.", "efeitos": {"flag": "visao_vista"}},
], seguir=V)
cena("c-audicao", [P("Você ouve o ritmo do mecanismo: um estalo, uma pausa, a flecha.")], seguir=V)
cena("c-audicao-falha", [P("Você tenta ouvir o mecanismo, mas só escuta o próprio coração.")], seguir=V)
cena("c-fim", [
    N("Você chega ao outro lado, ofegante. Desta vez, a luz não feriu. Guiou.", bustoHeroi="determinado"),
    P("Eu não posso desistir. Não ainda.", bustoHeroi="determinado", efeitos={"flag": "atravessou_solem"}),
], seguir=V)

# ---------------- Parte 5 · A escuridão e a porta ----------------
cena("e-apaga", [N("A tocha se apaga."), N("A escuridão é total. Você não vê as próprias mãos.")], seguir=V)
cena("e-voltar", [P("Não há caminho de volta. Artho trancou o alçapão.")], seguir=V)
cena("e-vontade-ok", [P("O medo está aqui. Mas você também está.")], seguir=V)
cena("e-vontade-falha", [N("Suas pernas tremem. Você para, respira… e dá o passo mesmo assim.")], seguir=V)
cena("e-nyme", [P("Você sempre chega atrasad{o|a}, {nome}… mas sempre chega.")], seguir=V)
cena("e-porta", [N("No fim do corredor, uma porta imensa, entalhada com padrões sagrados. No centro, um sol dourado brilha sozinho, como se esperasse por você.")],
     fundo="cena-porta-solem", seguir={"voltar": True, "texto": "Abrir a porta"})

# ---------------- Parte 6 · O Salão e a Forja ----------------
cena("f-entrada", [
    N("A porta se abre para um salão que não deveria existir: mármore antigo, sete estátuas em círculo e, no centro, uma luz que sobe do chão como se respirasse."),
    P("Eu já estive aqui. No sonho."),
], fundo="cena-salao-forja", seguir=V)
cena("f-vozes", [
    {"quem": "vozes", "rotulo": "As vozes", "estilo": "vozes", "texto": "Todos os seres são importantes. Cada fé, cada povo, cada vida. Escute com o coração… e escolha a quem seguir."},
    P("São sete. Mas você consegue distinguir cada uma, como vozes conhecidas numa multidão."),
], seguir=V)
for d, f in FRASES.items():
    cena(f"f-voz-{d}", [{"quem": "voz", "rotulo": VOZES_SONHO[d], "estilo": f"voz voz-{d}", "texto": f}], escolhas=[
        {"texto": "Seguir esta voz", "efeitos": {"divindade": d, "flag": "escolheu_voz"}, "voltar": True},
        {"texto": "Ouvir as outras", "voltar": True},
    ])
cena("f-apresentacao", [{"quem": "divindade", "rotulo": "{Divindade}", "texto": "Eu sou {Divindade}. E você, {nome}, foi ouvid{o|a}."}], seguir=V)

ato = {
    "id": "ato1", "numero": 1, "titulo": "Provação Sob a Luz", "lugar": "Templo de Sólem",
    # Nome do lugar de cada parte (cards de save e Diário; a tela não mostra "Parte N", Fase 6B).
    "nomesPartes": {"1": "O alçapão", "2": "O túnel", "3": "Os símbolos", "4": "O corredor de Sólem",
                    "5": "A escuridão", "6": "O Salão da Forja"},
    "totalPartes": 6,
    "inicio": "c1-01",
    "proximoCapitulo": {"numero": 2, "titulo": ""},
    "fundoFim": "cena-salao-forja", "musicaFim": "forja",
    # Diário (cresce ao longo das partes).
    "resumo": [
        {"flag": "implorou_artho", "texto": "Você implorou que Artho viesse junto. Ele ficou."},
        {"flag": "quis_lutar", "texto": "Você quis voltar e lutar pela Nyme. Artho não deixou."},
        {"flag": "obedeceu_artho", "texto": "Você apertou a tocha e desceu, em silêncio."},
        {"flag": "desceu_alcapao", "texto": "Artho trancou o alçapão sobre você."},
        {"flag": "memoria_liessa", "texto": "No túnel, você lembrou de Liessa."},
        {"flag": "caminho_tolerancia", "texto": "Você achou o caminho entre os símbolos dos outros deuses."},
        {"flag": "atravessou_solem", "texto": "Você atravessou o corredor de Sólem."},
        {"flag": "seguiu_a_luz", "texto": "No corredor de Sólem, você seguiu a luz sem nenhuma flecha."},
        {"flag": "coragem_escuro", "texto": "No escuro total, você não parou."},
        {"flag": "escolheu_voz", "texto": "No Salão da Forja, você seguiu a voz de {Divindade}."},
    ],
    "cenas": cenas,
}
destino = os.path.join(os.path.dirname(__file__), "..", "src", "data", "capitulos", "ato1.json")
with open(destino, "w", encoding="utf-8") as f:
    json.dump(ato, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"{len(cenas)} cenas em {os.path.normpath(destino)}")
