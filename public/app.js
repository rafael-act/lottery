/* global Vue, Vuetify, Chart */
const { createApp, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;
const { createVuetify, useTheme } = Vuetify;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const fmt = new Intl.NumberFormat('pt-BR');
const fmt2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const dz = (d) => String(d).padStart(2, '0');
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const lerPreferencia = (chave, padrao) => {
  try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
};
const gravarPreferencia = (chave, valor) => {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ }
};

async function api(url, opcoes) {
  const resp = await fetch(url, opcoes);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.erro || resp.statusText);
  return json;
}

// Cores dos gráficos (validadas para contraste e daltonismo em cada tema)
const CORES_GRAFICO = {
  claro: { barra: '#2E7D32', referencia: '#616161', grade: 'rgba(0,0,0,0.06)', texto: '#5f6b5f' },
  escuro: { barra: '#43A047', referencia: '#BDBDBD', grade: 'rgba(255,255,255,0.08)', texto: '#b5c2b5' },
};

// Escala sequencial (um único matiz verde, do claro ao escuro) para o mapa de calor
const ESCALA_CALOR = {
  claro: ['#E8F5E9', '#1B5E20'],
  escuro: ['#1F3321', '#81C784'],
};

function interpolar(c1, c2, t) {
  const a = c1.match(/\w\w/g).map((h) => parseInt(h, 16));
  const b = c2.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

// ---------------------------------------------------------------------------
// Componente: gráfico de barras (Chart.js)
// ---------------------------------------------------------------------------
const GraficoBarras = {
  props: {
    labels: Array,
    datasets: Array,
    escuro: Boolean,
    altura: { type: Number, default: 300 },
    tituloX: String,
    tituloY: String,
    tooltip: Function,
  },
  setup(props) {
    const canvas = ref(null);
    let grafico = null;

    const desenhar = () => {
      grafico?.destroy();
      if (!canvas.value || !props.labels?.length) return;
      const cores = props.escuro ? CORES_GRAFICO.escuro : CORES_GRAFICO.claro;
      grafico = new Chart(canvas.value, {
        data: { labels: props.labels, datasets: props.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: props.datasets.length > 1,
              position: 'top',
              align: 'end',
              labels: { color: cores.texto, usePointStyle: true, boxWidth: 8 },
            },
            tooltip: {
              callbacks: props.tooltip ? { label: props.tooltip } : {},
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: cores.texto, autoSkip: true, maxRotation: 0 },
              title: { display: !!props.tituloX, text: props.tituloX, color: cores.texto },
            },
            y: {
              beginAtZero: true,
              grid: { color: cores.grade },
              border: { display: false },
              ticks: { color: cores.texto, precision: 0 },
              title: { display: !!props.tituloY, text: props.tituloY, color: cores.texto },
            },
          },
        },
      });
    };

    onMounted(desenhar);
    onBeforeUnmount(() => grafico?.destroy());
    watch(() => [props.labels, props.datasets, props.escuro], () => nextTick(desenhar), { deep: true });
    return { canvas };
  },
  template: `<div :style="{ position: 'relative', height: altura + 'px' }"><canvas ref="canvas"></canvas></div>`,
};

// ---------------------------------------------------------------------------
// Componente: volante com mapa de calor (opcionalmente clicável)
// ---------------------------------------------------------------------------
const Volante = {
  props: {
    dezenas: Array, // [{dezena, ocorrencias, incidencia}]
    colunas: { type: Number, default: 10 },
    escuro: Boolean,
    clicavel: Boolean,
    selecionadas: { type: Array, default: () => [] },
  },
  emits: ['alternar'],
  setup(props) {
    const faixa = computed(() => {
      const v = props.dezenas.map((d) => d.ocorrencias);
      return { min: Math.min(...v), max: Math.max(...v) };
    });
    const estilo = (d) => {
      const { min, max } = faixa.value;
      const t = max > min ? (d.ocorrencias - min) / (max - min) : 0.5;
      const [c1, c2] = props.escuro ? ESCALA_CALOR.escuro : ESCALA_CALOR.claro;
      const textoClaro = props.escuro ? t < 0.55 : t > 0.5;
      return { background: interpolar(c1, c2, t), color: textoClaro ? '#fff' : '#10301a' };
    };
    const gradiente = computed(() => {
      const [c1, c2] = props.escuro ? ESCALA_CALOR.escuro : ESCALA_CALOR.claro;
      return { background: `linear-gradient(90deg, ${c1}, ${c2})` };
    });
    return { faixa, estilo, gradiente, dz, fmt };
  },
  template: `
    <div>
      <div class="volante" :style="{ gridTemplateColumns: 'repeat(' + colunas + ', minmax(0, 1fr))' }">
        <component :is="clicavel ? 'button' : 'div'" v-for="d in dezenas" :key="d.dezena"
             class="celula" :class="{ clicavel, selecionada: selecionadas.includes(d.dezena) }"
             :style="estilo(d)" :title="'Dezena ' + dz(d.dezena) + ': ' + d.ocorrencias + ' ocorrências (' + d.incidencia + '% dos concursos)'"
             @click="clicavel && $emit('alternar', d.dezena)">
          <span class="num">{{ dz(d.dezena) }}</span>
          <span class="qtd">{{ d.ocorrencias }}x</span>
        </component>
      </div>
      <div class="d-flex align-center ga-2 mt-3 text-caption text-medium-emphasis">
        <span>{{ fmt.format(faixa.min) }} ocorrências</span>
        <div class="legenda-calor flex-grow-1" :style="gradiente"></div>
        <span>{{ fmt.format(faixa.max) }} ocorrências</span>
      </div>
    </div>`,
};

// ---------------------------------------------------------------------------
// Aplicação
// ---------------------------------------------------------------------------
const App = {
  components: { GraficoBarras, Volante },
  setup() {
    const theme = useTheme();
    const escuro = computed(() => theme.global.current.value.dark);
    const alternarTema = () => {
      theme.global.name.value = escuro.value ? 'verde' : 'verdeEscuro';
      gravarPreferencia('tema', theme.global.name.value);
    };

    const modalidades = ref([]);
    const [hashModalidade, hashAba] = decodeURIComponent(location.hash.slice(1)).split('/');
    const codigo = ref(hashModalidade || lerPreferencia('modalidade', 'lotofacil'));
    const anos = ref(2);
    const aba = ref(hashAba || 'ocorrencias');
    const stats = ref(null);
    const concursos = ref([]);
    const carregando = ref(false);
    const erro = ref('');
    const mostrarAviso = ref(true);
    const snackbar = ref({ visivel: false, texto: '' });

    const cfg = computed(() => modalidades.value.find((m) => m.codigo === codigo.value));
    const colunasVolante = computed(() => (cfg.value?.dezenaMax === 25 ? 5 : 10));

    // ---- Carregamento -----------------------------------------------------
    async function carregar() {
      if (!cfg.value) return;
      gravarPreferencia('modalidade', codigo.value);
      carregando.value = true;
      erro.value = '';
      sugestoes.value = null;
      conferencia.value = null;
      selecionadas.value = [];
      dezenasPorJogo.value = cfg.value.apostaMin;
      try {
        const q = `anos=${anos.value}`;
        const [s, c] = await Promise.all([
          api(`/api/${codigo.value}/estatisticas?${q}`),
          api(`/api/${codigo.value}/concursos?${q}&limite=30`),
        ]);
        stats.value = s;
        concursos.value = c;
        await gerar();
      } catch (e) {
        stats.value = null;
        erro.value = e.message;
      } finally {
        carregando.value = false;
      }
    }

    onMounted(async () => {
      try {
        const conf = await api('/api/config');
        modalidades.value = conf.modalidades;
        anos.value = conf.anosAnalise;
        if (!cfg.value) codigo.value = conf.modalidades[0].codigo;
        await carregar();
      } catch (e) {
        erro.value = e.message;
      }
    });
    watch([codigo, anos], carregar);
    watch([codigo, aba], () => history.replaceState(null, '', `#${codigo.value}/${aba.value}`));

    // ---- Ocorrências ----------------------------------------------------------
    const cores = computed(() => (escuro.value ? CORES_GRAFICO.escuro : CORES_GRAFICO.claro));

    const graficoOcorrencias = computed(() => {
      if (!stats.value) return null;
      const r = stats.value.resumoOcorrencias;
      const n = stats.value.dezenas.length;
      const linha = (label, valor, dash) => ({
        type: 'line',
        label: `${label}: ${fmt2.format(valor)}`,
        data: Array(n).fill(valor),
        borderColor: cores.value.referencia,
        backgroundColor: cores.value.referencia,
        borderWidth: 2,
        borderDash: dash,
        pointRadius: 0,
        pointHitRadius: 0,
        pointStyle: 'line',
        order: 1,
      });
      return {
        labels: stats.value.dezenas.map((d) => dz(d.dezena)),
        datasets: [
          {
            type: 'bar',
            label: 'Ocorrências',
            data: stats.value.dezenas.map((d) => d.ocorrencias),
            backgroundColor: cores.value.barra,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: 'bottom',
            categoryPercentage: 0.85,
            barPercentage: 0.9,
            order: 2,
          },
          linha('Média', r.media, [6, 4]),
          linha('Mediana', r.mediana, [2, 3]),
        ],
      };
    });

    const tooltipOcorrencias = (ctx) => {
      if (ctx.dataset.type !== 'bar') return ctx.dataset.label;
      const d = stats.value.dezenas[ctx.dataIndex];
      return ` ${fmt.format(d.ocorrencias)} ocorrências · ${fmt2.format(d.incidencia)}% dos concursos`;
    };

    const cabecalhos = [
      { title: 'Dezena', key: 'dezena', width: 90 },
      { title: 'Ocorrências', key: 'ocorrencias', align: 'end' },
      { title: 'Incidência (% concursos)', key: 'incidencia', width: 220 },
      { title: 'vs. esperado', key: 'desvioEsperado', align: 'end' },
      { title: 'Atraso atual', key: 'atraso', align: 'end' },
      { title: 'Maior atraso', key: 'maiorAtraso', align: 'end' },
      { title: 'Último concurso', key: 'ultimoConcurso', align: 'end' },
      { title: 'Classificação', key: 'classificacao', align: 'center' },
    ];
    const CLASSIFICACAO = {
      quente: { cor: 'deep-orange-darken-2', icone: 'mdi-fire', texto: 'Quente' },
      neutra: { cor: 'grey', icone: 'mdi-minus-circle-outline', texto: 'Neutra' },
      fria: { cor: 'blue-darken-2', icone: 'mdi-snowflake', texto: 'Fria' },
    };
    const maxIncidencia = computed(() => Math.max(...(stats.value?.dezenas ?? []).map((d) => d.incidencia), 1));

    // ---- Padrões --------------------------------------------------------------
    const ICONES_PADRAO = {
      soma: 'mdi-sigma',
      pares: 'mdi-numeric-2-box-multiple-outline',
      baixas: 'mdi-arrow-collapse-down',
      primos: 'mdi-alpha-p-box-outline',
      repetidas: 'mdi-repeat',
    };

    function graficoPadrao(p) {
      let pontos = p.distribuicao;
      // Muitos valores distintos (ex.: soma) -> agrupa em faixas
      if (pontos.length > 30) {
        const largura = Math.ceil((p.maximo - p.minimo + 1) / 20);
        const grupos = new Map();
        for (const { valor, vezes } of pontos) {
          const ini = p.minimo + Math.floor((valor - p.minimo) / largura) * largura;
          grupos.set(ini, (grupos.get(ini) ?? 0) + vezes);
        }
        pontos = [...grupos.entries()].map(([ini, vezes]) => ({ valor: `${ini}–${ini + largura - 1}`, vezes }));
      }
      return {
        labels: pontos.map((x) => String(x.valor)),
        datasets: [
          {
            type: 'bar',
            label: 'Concursos',
            data: pontos.map((x) => x.vezes),
            backgroundColor: cores.value.barra,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: 'bottom',
            categoryPercentage: 0.85,
            barPercentage: 0.9,
          },
        ],
      };
    }
    const graficosPadroes = computed(() =>
      stats.value ? Object.fromEntries(Object.entries(stats.value.padroes).map(([k, p]) => [k, graficoPadrao(p)])) : {},
    );
    const tooltipConcursos = (ctx) => ` ${fmt.format(ctx.parsed.y)} concursos`;

    // ---- Sugestões --------------------------------------------------------------
    const dezenasPorJogo = ref(15);
    const quantidadeJogos = ref(5);
    const sugestoes = ref(null);
    const gerando = ref(false);

    async function gerar() {
      gerando.value = true;
      try {
        sugestoes.value = await api(
          `/api/${codigo.value}/sugestoes?anos=${anos.value}&dezenas=${dezenasPorJogo.value}&quantidade=${quantidadeJogos.value}`,
        );
      } catch (e) {
        notificar(e.message);
      } finally {
        gerando.value = false;
      }
    }

    const CORES_ESTRATEGIA = { moda: 'primary', mediana: 'secondary', media: 'success' };
    const ICONES_ESTRATEGIA = { moda: 'mdi-chart-bar', mediana: 'mdi-format-vertical-align-center', media: 'mdi-scale-balance' };

    async function copiar(dezenas) {
      const texto = dezenas.map(dz).join(' ');
      try {
        await navigator.clipboard.writeText(texto);
        notificar(`Copiado: ${texto}`);
      } catch {
        notificar(texto);
      }
    }

    // ---- Analisar meu jogo --------------------------------------------------------
    const selecionadas = ref([]);
    const conferencia = ref(null);
    const conferindo = ref(false);

    function alternarDezena(d) {
      conferencia.value = null;
      const i = selecionadas.value.indexOf(d);
      if (i >= 0) selecionadas.value.splice(i, 1);
      else if (selecionadas.value.length < cfg.value.apostaMax) selecionadas.value.push(d);
      else notificar(`Máximo de ${cfg.value.apostaMax} dezenas.`);
    }

    function usarJogo(dezenas) {
      selecionadas.value = [...dezenas];
      conferencia.value = null;
      aba.value = 'meujogo';
    }

    async function conferir() {
      conferindo.value = true;
      try {
        conferencia.value = await api(`/api/${codigo.value}/conferir?anos=${anos.value}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dezenas: selecionadas.value }),
        });
      } catch (e) {
        notificar(e.message);
      } finally {
        conferindo.value = false;
      }
    }

    const comparacaoMetricas = computed(() => {
      if (!conferencia.value || !stats.value) return [];
      const escala = conferencia.value.dezenas.length / cfg.value.qtdSorteadas;
      return ['soma', 'pares', 'baixas', 'primos'].map((k) => {
        const p = stats.value.padroes[k];
        const valor = conferencia.value.metricas[k];
        const ref1 = p.mediana * escala;
        const dentro = Math.abs(valor - ref1) <= Math.max(p.desvioPadrao * escala, 1);
        return { chave: k, titulo: p.titulo, valor, mediana: fmt2.format(ref1), media: fmt2.format(p.media * escala), dentro };
      });
    });

    function notificar(texto) {
      snackbar.value = { visivel: true, texto };
    }

    return {
      escuro, alternarTema, modalidades, codigo, anos, aba, stats, concursos, carregando, erro, mostrarAviso, snackbar,
      cfg, colunasVolante, carregar, graficoOcorrencias, tooltipOcorrencias, cabecalhos, CLASSIFICACAO, maxIncidencia,
      ICONES_PADRAO, graficosPadroes, tooltipConcursos, dezenasPorJogo, quantidadeJogos, sugestoes, gerando, gerar,
      CORES_ESTRATEGIA, ICONES_ESTRATEGIA, copiar, selecionadas, conferencia, conferindo, alternarDezena, usarJogo,
      conferir, comparacaoMetricas, fmt, fmt2, dz, dataBR,
      opcoesAnos: [1, 2, 3, 5].map((n) => ({ title: n === 1 ? 'Último ano' : `Últimos ${n} anos`, value: n })),
    };
  },

  template: `
<v-app>
  <v-app-bar color="primary" elevation="2" density="comfortable">
    <template #prepend><v-icon icon="mdi-clover" class="ml-2"></v-icon></template>
    <v-app-bar-title>
      Loterias <span class="font-weight-light">• Análise Estatística</span>
    </v-app-bar-title>
    <v-select v-model="anos" :items="opcoesAnos" density="compact" variant="solo-filled" flat hide-details
              prepend-inner-icon="mdi-calendar-range" style="max-width: 210px" class="mr-2" bg-color="rgba(255,255,255,0.15)"></v-select>
    <v-btn icon="mdi-refresh" title="Recarregar" @click="carregar"></v-btn>
    <v-btn :icon="escuro ? 'mdi-white-balance-sunny' : 'mdi-weather-night'" title="Alternar tema" @click="alternarTema"></v-btn>

    <template #extension>
      <v-tabs v-model="codigo" align-tabs="center" grow color="white" slider-color="accent">
        <v-tab v-for="m in modalidades" :key="m.codigo" :value="m.codigo" :prepend-icon="m.icone">{{ m.nome }}</v-tab>
      </v-tabs>
    </template>
    <v-progress-linear :active="carregando" indeterminate color="accent" absolute location="bottom"></v-progress-linear>
  </v-app-bar>

  <v-main>
    <v-container class="conteudo py-6">
      <v-alert v-if="mostrarAviso" type="info" variant="tonal" closable class="mb-4" icon="mdi-information-outline"
               @click:close="mostrarAviso = false">
        Os sorteios são aleatórios e independentes: estatísticas do passado <strong>não aumentam</strong> a chance de acerto.
        As sugestões organizam os jogos segundo os padrões históricos (média, moda e mediana) — jogue com responsabilidade.
      </v-alert>

      <v-alert v-if="erro" type="warning" variant="tonal" class="mb-4" title="Não foi possível carregar os dados">
        {{ erro }}
        <div class="mt-2 text-body-2">Verifique o arquivo <code>.env</code>, rode <code>npm run db:init</code> e <code>npm run db:import</code>.</div>
      </v-alert>

      <template v-if="stats && cfg">
        <!-- Indicadores -->
        <v-row class="mb-2">
          <v-col cols="12" sm="6" lg="3">
            <v-card class="h-100" variant="flat" border>
              <v-card-item>
                <template #prepend><v-avatar color="primary" variant="tonal" icon="mdi-ticket-confirmation-outline"></v-avatar></template>
                <v-card-subtitle>Concursos analisados</v-card-subtitle>
                <div class="kpi-valor">{{ fmt.format(stats.totalConcursos) }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ dataBR(stats.primeiroConcurso.data) }} a {{ dataBR(stats.ultimoConcurso.data) }}
                </div>
              </v-card-item>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" lg="3">
            <v-card class="h-100" variant="flat" border>
              <v-card-item>
                <template #prepend><v-avatar color="primary" variant="tonal" icon="mdi-counter"></v-avatar></template>
                <v-card-subtitle>Volume de ocorrências</v-card-subtitle>
                <div class="kpi-valor">{{ fmt.format(stats.volumeOcorrencias) }}</div>
                <div class="text-caption text-medium-emphasis">
                  dezenas sorteadas ({{ cfg.qtdSorteadas }} por concurso) · esperado {{ fmt2.format(stats.ocorrenciaEsperada) }} por dezena
                </div>
              </v-card-item>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" lg="3">
            <v-card class="h-100" variant="flat" border>
              <v-card-item>
                <v-card-subtitle class="mb-2">Ocorrências por dezena</v-card-subtitle>
                <div class="kpi-trio">
                  <div><div class="kpi-valor">{{ fmt2.format(stats.resumoOcorrencias.media) }}</div><div class="text-caption">Média</div></div>
                  <div><div class="kpi-valor">{{ fmt2.format(stats.resumoOcorrencias.mediana) }}</div><div class="text-caption">Mediana</div></div>
                  <div><div class="kpi-valor">{{ stats.resumoOcorrencias.moda.slice(0, 2).join(' / ') }}</div><div class="text-caption">Moda</div></div>
                </div>
              </v-card-item>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" lg="3">
            <v-card class="h-100" variant="flat" border>
              <v-card-item>
                <v-card-subtitle>Último concurso · nº {{ stats.ultimoConcurso.numero }} · {{ dataBR(stats.ultimoConcurso.data) }}</v-card-subtitle>
                <div class="bolas mt-2">
                  <span v-for="d in stats.ultimoConcurso.dezenas" :key="d" class="bola pequena">{{ dz(d) }}</span>
                </div>
              </v-card-item>
            </v-card>
          </v-col>
        </v-row>

        <v-card variant="flat" border>
          <v-tabs v-model="aba" color="primary" show-arrows>
            <v-tab value="ocorrencias" prepend-icon="mdi-chart-bar">Ocorrências</v-tab>
            <v-tab value="padroes" prepend-icon="mdi-chart-bell-curve">Padrões dos sorteios</v-tab>
            <v-tab value="sugestoes" prepend-icon="mdi-auto-fix">Sugestões de jogos</v-tab>
            <v-tab value="meujogo" prepend-icon="mdi-grid">Analisar meu jogo</v-tab>
            <v-tab value="concursos" prepend-icon="mdi-history">Últimos concursos</v-tab>
          </v-tabs>
          <v-divider></v-divider>

          <v-window v-model="aba">
            <!-- ================= OCORRÊNCIAS ================= -->
            <v-window-item value="ocorrencias" class="pa-4">
              <v-row>
                <v-col cols="12" lg="8">
                  <div class="text-subtitle-1 font-weight-medium">Ocorrências por dezena</div>
                  <div class="text-caption text-medium-emphasis mb-2">
                    Quantas vezes cada dezena foi sorteada em {{ fmt.format(stats.totalConcursos) }} concursos
                  </div>
                  <grafico-barras v-if="graficoOcorrencias" :labels="graficoOcorrencias.labels" :datasets="graficoOcorrencias.datasets"
                                  :escuro="escuro" :altura="320" titulo-x="Dezena" titulo-y="Ocorrências" :tooltip="tooltipOcorrencias"></grafico-barras>
                </v-col>
                <v-col cols="12" lg="4">
                  <div class="text-subtitle-1 font-weight-medium">Mapa de calor</div>
                  <div class="text-caption text-medium-emphasis mb-2">Quanto mais escuro, mais ocorrências</div>
                  <volante :dezenas="stats.dezenas" :colunas="colunasVolante" :escuro="escuro"></volante>
                </v-col>
              </v-row>

              <v-row class="mt-2">
                <v-col cols="12" lg="8">
                  <div class="text-subtitle-1 font-weight-medium mb-2">Ocorrências e incidências por dezena</div>
                  <v-data-table :headers="cabecalhos" :items="stats.dezenas" :sort-by="[{ key: 'ocorrencias', order: 'desc' }]"
                                density="compact" :items-per-page="cfg.dezenaMax > 25 ? 20 : 25" items-per-page-text="Dezenas por página" page-text="{0}–{1} de {2}" no-data-text="Sem dados">
                    <template #item.dezena="{ item }"><span class="bola pequena">{{ dz(item.dezena) }}</span></template>
                    <template #item.ocorrencias="{ item }"><strong class="numero">{{ fmt.format(item.ocorrencias) }}</strong></template>
                    <template #item.incidencia="{ item }">
                      <div class="d-flex align-center ga-2">
                        <v-progress-linear :model-value="item.incidencia / maxIncidencia * 100" color="primary" height="6" rounded></v-progress-linear>
                        <span class="numero text-no-wrap" style="min-width: 52px">{{ fmt2.format(item.incidencia) }}%</span>
                      </div>
                    </template>
                    <template #item.desvioEsperado="{ item }">
                      <span class="numero" :class="item.desvioEsperado >= 0 ? 'text-success' : 'text-error'">
                        {{ item.desvioEsperado > 0 ? '+' : '' }}{{ fmt2.format(item.desvioEsperado) }}%
                      </span>
                    </template>
                    <template #item.ultimoConcurso="{ item }"><span class="numero">{{ item.ultimoConcurso ?? '—' }}</span></template>
                    <template #item.classificacao="{ item }">
                      <v-chip size="small" variant="tonal" :color="CLASSIFICACAO[item.classificacao].cor"
                              :prepend-icon="CLASSIFICACAO[item.classificacao].icone">{{ CLASSIFICACAO[item.classificacao].texto }}</v-chip>
                    </template>
                  </v-data-table>
                </v-col>
                <v-col cols="12" lg="4">
                  <div class="text-subtitle-1 font-weight-medium">Incidências por número de ocorrências</div>
                  <div class="text-caption text-medium-emphasis mb-2">Quantas dezenas saíram a mesma quantidade de vezes</div>
                  <v-table density="compact">
                    <thead><tr><th class="text-end">Ocorrências</th><th class="text-end">Dezenas</th><th>Quais</th></tr></thead>
                    <tbody>
                      <tr v-for="g in [...stats.incidenciasPorOcorrencia].reverse()" :key="g.ocorrencias">
                        <td class="text-end numero">{{ g.ocorrencias }}</td>
                        <td class="text-end numero">{{ g.qtdDezenas }}</td>
                        <td class="py-1"><div class="bolas"><span v-for="d in g.dezenas" :key="d" class="bola pequena contorno">{{ dz(d) }}</span></div></td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-col>
              </v-row>
            </v-window-item>

            <!-- ================= PADRÕES ================= -->
            <v-window-item value="padroes" class="pa-4">
              <v-row>
                <v-col v-for="(p, chave) in stats.padroes" :key="chave" cols="12" md="6" xl="4">
                  <v-card variant="tonal" color="primary" class="h-100">
                    <v-card-item :prepend-icon="ICONES_PADRAO[chave]">
                      <v-card-title>{{ p.titulo }}</v-card-title>
                      <v-card-subtitle>{{ p.descricao }}</v-card-subtitle>
                    </v-card-item>
                    <v-card-text class="text-high-emphasis">
                      <div class="kpi-trio mb-3">
                        <div><div class="kpi-valor">{{ fmt2.format(p.media) }}</div><div class="text-caption">Média</div></div>
                        <div><div class="kpi-valor">{{ fmt2.format(p.mediana) }}</div><div class="text-caption">Mediana</div></div>
                        <div><div class="kpi-valor">{{ p.moda.slice(0, 2).join(' / ') }}</div><div class="text-caption">Moda</div></div>
                      </div>
                      <div class="text-caption mb-2">
                        Desvio-padrão {{ fmt2.format(p.desvioPadrao) }} · mínimo {{ p.minimo }} · máximo {{ p.maximo }}
                      </div>
                      <grafico-barras :labels="graficosPadroes[chave].labels" :datasets="graficosPadroes[chave].datasets"
                                      :escuro="escuro" :altura="170" :tooltip="tooltipConcursos"></grafico-barras>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <div class="text-subtitle-1 font-weight-medium mt-6">Estatística por posição</div>
              <div class="text-caption text-medium-emphasis mb-2">
                Dezenas ordenadas de cada sorteio: valor típico da 1ª, 2ª, ... {{ cfg.qtdSorteadas }}ª dezena
              </div>
              <v-table density="compact">
                <thead>
                  <tr><th>Posição</th><th class="text-end">Média</th><th class="text-end">Mediana</th><th class="text-end">Moda</th><th class="text-end">Mínimo</th><th class="text-end">Máximo</th></tr>
                </thead>
                <tbody>
                  <tr v-for="p in stats.posicional" :key="p.posicao">
                    <td>{{ p.posicao }}ª dezena</td>
                    <td class="text-end numero">{{ fmt2.format(p.media) }}</td>
                    <td class="text-end"><span class="bola pequena">{{ dz(Math.round(p.mediana)) }}</span></td>
                    <td class="text-end numero">{{ p.moda.map(dz).join(', ') }}</td>
                    <td class="text-end numero">{{ dz(p.minimo) }}</td>
                    <td class="text-end numero">{{ dz(p.maximo) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-window-item>

            <!-- ================= SUGESTÕES ================= -->
            <v-window-item value="sugestoes" class="pa-4">
              <v-row align="center">
                <v-col cols="12" md="4">
                  <div class="text-body-2 mb-1">Dezenas por jogo: <strong>{{ dezenasPorJogo }}</strong></div>
                  <v-slider v-model="dezenasPorJogo" :min="cfg.apostaMin" :max="cfg.apostaMax" :step="1" color="primary"
                            show-ticks="always" hide-details thumb-label></v-slider>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="text-body-2 mb-1">Quantidade de jogos: <strong>{{ quantidadeJogos }}</strong></div>
                  <v-slider v-model="quantidadeJogos" :min="1" :max="12" :step="1" color="primary" hide-details thumb-label></v-slider>
                </v-col>
                <v-col cols="12" md="4" class="text-md-end">
                  <v-btn color="primary" size="large" prepend-icon="mdi-auto-fix" :loading="gerando" @click="gerar">Gerar sugestões</v-btn>
                </v-col>
              </v-row>

              <template v-if="sugestoes">
                <v-sheet rounded="lg" class="pa-3 my-4" color="surface-variant">
                  <div class="text-body-2 mb-1">
                    <v-icon icon="mdi-percent-outline" size="small"></v-icon>
                    Probabilidade real de uma aposta com <strong>{{ sugestoes.dezenasPorJogo }}</strong> dezenas:
                  </div>
                  <div class="d-flex flex-wrap ga-2">
                    <v-chip v-for="p in sugestoes.probabilidades" :key="p.faixa" variant="outlined" size="small">
                      {{ p.nome }} ({{ p.acertos }} acertos): 1 em {{ fmt.format(p.umEm) }}
                    </v-chip>
                  </div>
                </v-sheet>

                <v-row>
                  <v-col v-for="(j, i) in sugestoes.jogos" :key="i" cols="12" md="6" xl="4">
                    <v-card class="h-100" border variant="flat">
                      <v-card-item>
                        <template #prepend>
                          <v-avatar :color="CORES_ESTRATEGIA[j.estrategia]" variant="tonal" :icon="ICONES_ESTRATEGIA[j.estrategia]"></v-avatar>
                        </template>
                        <v-card-title class="text-subtitle-1 font-weight-medium">{{ j.titulo }}</v-card-title>
                        <v-card-subtitle class="text-wrap">{{ j.descricao }}</v-card-subtitle>
                      </v-card-item>
                      <v-card-text>
                        <div class="bolas mb-3"><span v-for="d in j.dezenas" :key="d" class="bola">{{ dz(d) }}</span></div>
                        <div class="d-flex flex-wrap ga-1 mb-3">
                          <v-chip size="x-small" variant="tonal">Soma {{ j.metricas.soma }}</v-chip>
                          <v-chip size="x-small" variant="tonal">Pares {{ j.metricas.pares }}</v-chip>
                          <v-chip size="x-small" variant="tonal">Baixas {{ j.metricas.baixas }}</v-chip>
                          <v-chip size="x-small" variant="tonal">Primos {{ j.metricas.primos }}</v-chip>
                        </div>
                        <div class="text-caption text-medium-emphasis mb-1">
                          Se jogado em todos os {{ fmt.format(j.historico.concursosConferidos) }} concursos do período:
                        </div>
                        <div class="faixas">
                          <div v-for="f in j.historico.faixas" :key="f.faixa" class="faixa">
                            <div class="vezes">{{ f.vezes }}x</div>
                            <div class="text-caption">{{ f.nome }} · {{ f.acertos }} acertos</div>
                          </div>
                        </div>
                        <div class="text-caption mt-2">
                          Melhor resultado: <strong>{{ j.historico.melhorAcerto.acertos }} acertos</strong>
                          <span v-if="j.historico.melhorAcerto.concurso"> (concurso {{ j.historico.melhorAcerto.concurso }})</span>
                        </div>
                      </v-card-text>
                      <v-card-actions>
                        <v-btn variant="text" color="primary" prepend-icon="mdi-content-copy" @click="copiar(j.dezenas)">Copiar</v-btn>
                        <v-btn variant="text" color="primary" prepend-icon="mdi-magnify" @click="usarJogo(j.dezenas)">Analisar</v-btn>
                      </v-card-actions>
                    </v-card>
                  </v-col>
                </v-row>
                <div class="text-caption text-medium-emphasis mt-2">Semente da geração: {{ sugestoes.semente }}</div>
              </template>
            </v-window-item>

            <!-- ================= ANALISAR MEU JOGO ================= -->
            <v-window-item value="meujogo" class="pa-4">
              <v-row>
                <v-col cols="12" md="5">
                  <div class="text-subtitle-1 font-weight-medium">Monte seu jogo</div>
                  <div class="text-caption text-medium-emphasis mb-3">
                    Marque de {{ cfg.apostaMin }} a {{ cfg.apostaMax }} dezenas. As cores mostram as ocorrências no período.
                  </div>
                  <volante :dezenas="stats.dezenas" :colunas="colunasVolante" :escuro="escuro" clicavel
                           :selecionadas="selecionadas" @alternar="alternarDezena"></volante>
                  <div class="d-flex align-center flex-wrap ga-2 mt-4">
                    <v-chip :color="selecionadas.length >= cfg.apostaMin ? 'primary' : undefined" variant="tonal">
                      {{ selecionadas.length }} marcada(s)
                    </v-chip>
                    <v-spacer></v-spacer>
                    <v-btn variant="text" prepend-icon="mdi-eraser" @click="selecionadas = []; conferencia = null">Limpar</v-btn>
                    <v-btn color="primary" prepend-icon="mdi-check-decagram" :loading="conferindo"
                           :disabled="selecionadas.length < cfg.apostaMin" @click="conferir">Analisar</v-btn>
                  </div>
                </v-col>

                <v-col cols="12" md="7">
                  <v-empty-state v-if="!conferencia" icon="mdi-gesture-tap" title="Selecione as dezenas"
                                 text="O jogo será comparado com a média, mediana e moda dos sorteios e conferido em todos os concursos do período."></v-empty-state>
                  <template v-else>
                    <div class="bolas mb-4"><span v-for="d in conferencia.dezenas" :key="d" class="bola">{{ dz(d) }}</span></div>

                    <div class="text-subtitle-2 mb-2">Comparação com o histórico</div>
                    <v-table density="compact" class="mb-4">
                      <thead><tr><th>Característica</th><th class="text-end">Seu jogo</th><th class="text-end">Média</th><th class="text-end">Mediana</th><th class="text-center">Situação</th></tr></thead>
                      <tbody>
                        <tr v-for="c in comparacaoMetricas" :key="c.chave">
                          <td>{{ c.titulo }}</td>
                          <td class="text-end numero"><strong>{{ c.valor }}</strong></td>
                          <td class="text-end numero">{{ c.media }}</td>
                          <td class="text-end numero">{{ c.mediana }}</td>
                          <td class="text-center">
                            <v-chip size="x-small" variant="tonal" :color="c.dentro ? 'success' : 'warning'"
                                    :prepend-icon="c.dentro ? 'mdi-check' : 'mdi-alert-outline'">{{ c.dentro ? 'Dentro do padrão' : 'Fora do padrão' }}</v-chip>
                          </td>
                        </tr>
                      </tbody>
                    </v-table>

                    <div class="text-subtitle-2 mb-2">Desempenho em {{ fmt.format(conferencia.historico.concursosConferidos) }} concursos</div>
                    <div class="faixas mb-3">
                      <div v-for="f in conferencia.historico.faixas" :key="f.faixa" class="faixa">
                        <div class="vezes">{{ f.vezes }}x</div>
                        <div class="text-caption">{{ f.nome }} · {{ f.acertos }} acertos</div>
                        <div v-if="f.concursos.length" class="text-caption text-medium-emphasis">conc. {{ f.concursos.slice(0, 3).join(', ') }}<span v-if="f.vezes > 3">…</span></div>
                      </div>
                    </div>
                    <div class="d-flex flex-wrap ga-1 mb-4">
                      <v-chip v-for="d in conferencia.historico.distribuicaoAcertos" :key="d.acertos" size="small" variant="outlined">
                        {{ d.acertos }} acertos: {{ fmt.format(d.vezes) }}x
                      </v-chip>
                    </div>

                    <div class="text-subtitle-2 mb-2">Probabilidade real desta aposta</div>
                    <div class="d-flex flex-wrap ga-2">
                      <v-chip v-for="p in conferencia.probabilidades" :key="p.faixa" size="small" variant="tonal" color="primary">
                        {{ p.nome }}: 1 em {{ fmt.format(p.umEm) }}
                      </v-chip>
                    </div>
                  </template>
                </v-col>
              </v-row>
            </v-window-item>

            <!-- ================= ÚLTIMOS CONCURSOS ================= -->
            <v-window-item value="concursos" class="pa-4">
              <v-table density="comfortable" hover>
                <thead>
                  <tr><th>Concurso</th><th>Data</th><th>Dezenas</th><th class="text-end">Ganhadores 1º prêmio</th><th class="text-center">Situação</th></tr>
                </thead>
                <tbody>
                  <tr v-for="c in concursos" :key="c.numero">
                    <td class="numero font-weight-medium">{{ c.numero }}</td>
                    <td class="numero text-no-wrap">{{ dataBR(c.data) }}</td>
                    <td class="py-2"><div class="bolas"><span v-for="d in c.dezenas" :key="d" class="bola pequena">{{ dz(d) }}</span></div></td>
                    <td class="text-end numero">{{ fmt.format(c.premiacao.find(p => p.faixa === 1)?.ganhadores ?? 0) }}</td>
                    <td class="text-center">
                      <v-chip size="small" variant="tonal" :color="c.acumulado ? 'warning' : 'success'"
                              :prepend-icon="c.acumulado ? 'mdi-trending-up' : 'mdi-trophy-outline'">{{ c.acumulado ? 'Acumulou' : 'Saiu' }}</v-chip>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-window-item>
          </v-window>
        </v-card>
      </template>
    </v-container>
  </v-main>

  <v-snackbar v-model="snackbar.visivel" timeout="3000" color="primary">{{ snackbar.texto }}</v-snackbar>
</v-app>`,
};

// ---------------------------------------------------------------------------
// Tema Material em tons de verde
// ---------------------------------------------------------------------------
const vuetify = createVuetify({
  theme: {
    defaultTheme: lerPreferencia('tema', 'verde'),
    themes: {
      verde: {
        dark: false,
        colors: {
          primary: '#2E7D32',
          secondary: '#558B2F',
          accent: '#00C853',
          success: '#1B5E20',
          info: '#00796B',
          warning: '#EF6C00',
          error: '#C62828',
          background: '#F4F8F2',
          surface: '#FFFFFF',
          'surface-variant': '#E3EFE0',
          'on-surface-variant': '#1B3A1E',
        },
      },
      verdeEscuro: {
        dark: true,
        colors: {
          primary: '#43A047',
          secondary: '#7CB342',
          accent: '#69F0AE',
          success: '#66BB6A',
          info: '#4DB6AC',
          warning: '#FFA726',
          error: '#EF5350',
          background: '#0F1A10',
          surface: '#172418',
          'surface-variant': '#22362A',
          'on-surface-variant': '#DCEDD9',
        },
      },
    },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'lg' },
  },
});

createApp(App).use(vuetify).mount('#app');
