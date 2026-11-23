/**
 * Every user-facing string lives here, grouped by area (spec 10.3).
 * Components must never hard-code text.
 */
export const strings = {
  app: {
    name: "LetterheadForge",
    tagline: "Papel timbrado, caderno e cartão — em PDF A4 para imprimir em casa",
    language: "pt-BR",
  },
  header: {
    presets: "Modelos",
    exportPdf: "Exportar PDF",
    exportPending: "A exportação entra no próximo marco",
  },
  panels: {
    ariaLabel: "Configuração da folha",
    placeholder: "Os controles desta seção entram nas próximas tarefas do marco.",
    sections: {
      page: "Folha",
      margins: "Margens",
      frame: "Moldura",
      ruling: "Pauta",
      watermark: "Marca d'água",
      layers: "Objetos e camadas",
      objects: "Objeto selecionado",
    },
    fields: {
      size: "Tamanho",
      orientation: "Orientação",
      pageColor: "Cor do papel",
      margins: {
        top: "Margem superior",
        right: "Margem direita",
        bottom: "Margem inferior",
        left: "Margem esquerda",
      },
      frameEnabled: "Mostrar moldura",
      frameColor: "Cor da moldura",
      frameStyle: "Estilo da moldura",
      frameThickness: "Espessura do traço",
      frameDoubleGap: "Distância entre os traços",
      frameCornerRadius: "Raio do canto",
      rulingEnabled: "Mostrar pauta",
      rulingType: "Tipo de pauta",
      rulingStyle: "Estilo do traço",
      rulingColor: "Cor da pauta",
      rulingThickness: "Espessura da linha",
      rulingDotRadius: "Raio dos pontos",
      rulingAxis: {
        y: {
          mode: "Modo das linhas horizontais",
          spacing: "Passo entre as linhas horizontais",
          count: "Quantidade de linhas horizontais",
        },
        x: {
          mode: "Modo das linhas verticais",
          spacing: "Passo entre as linhas verticais",
          count: "Quantidade de linhas verticais",
        },
      },
      rulingInsets: {
        top: "Recuo superior da pauta",
        right: "Recuo direito da pauta",
        bottom: "Recuo inferior da pauta",
        left: "Recuo esquerdo da pauta",
      },
    },
    enums: {
      size: { A4: "A4", A5: "A5", A6: "A6" },
      orientation: { portrait: "Retrato", landscape: "Paisagem" },
      frameStyle: {
        solid: "Contínua",
        dashed: "Tracejada",
        dotted: "Pontilhada",
        dashdot: "Traço e ponto",
        double: "Dupla",
      },
      rulingType: { lines: "Linhas", grid: "Grade", dots: "Pontos" },
      rulingStyle: {
        solid: "Contínua",
        dashed: "Tracejada",
        dotted: "Pontilhada",
        dashdot: "Traço e ponto",
      },
      rulingMode: { spacing: "Por passo", count: "Por quantidade" },
      alignment: { left: "Esquerda", center: "Centralizado", right: "Direita", justify: "Justificado" },
    },
    help: {
      pageColor: "Papéis claros gastam menos tinta e imprimem melhor.",
      frameColor: "Aceita transparência.",
      cornerRadius: "Ajustado automaticamente ao tamanho da moldura.",
      rulingType: "Linhas para escrita à mão, grade para quadrículos e pontos para diário.",
      rulingStyle: "Não se aplica à pauta de pontos.",
      rulingAxis: "Na pauta de linhas só o eixo vertical é usado.",
      rulingInsets: "O recuo afasta a pauta da moldura ou da margem.",
    },
    messages: {
      clamped: "Valor ajustado para {value} {unit}.",
      invalid: "Digite um número válido.",
    },
  },
  preview: {
    ariaLabel: "Pré-visualização da folha",
    modes: {
      page: "Página",
      sheet: "A4 montada",
    },
    hint: "Imprima em 100% (tamanho real), sem ajustar à página.",
    statusLoading: "Montando a pré-visualização…",
    statusReady: "Pré-visualização pronta",
  },
  layers: {
    empty: "Nenhum objeto na folha ainda.",
    promptRename: "Nome da camada",
    types: {
      image: "Imagem",
      text: "Texto",
    },
    actions: {
      up: "Subir",
      down: "Descer",
      hide: "Ocultar",
      show: "Mostrar",
      lock: "Bloquear",
      unlock: "Desbloquear",
      duplicate: "Duplicar",
      remove: "Excluir",
      rename: "Renomear",
    },
  },
  objects: {
    empty: "Selecione uma caixa de texto na lista de camadas para editar o conteúdo.",
    names: {
      text: "Texto {index}",
      image: "Imagem {index}",
    },
    describe: {
      label: "{name} · {type}",
      excerpt: "{label} — “{excerpt}”",
      emptyText: "{label} — vazio",
      excerptMax: 40,
    },
    fields: {
      content: "Conteúdo",
      font: "Fonte",
      size: "Corpo",
      weight: "Peso",
      italic: "Itálico",
      color: "Cor do texto",
      align: "Alinhamento",
    },
    actions: {
      addText: "Nova caixa de texto",
      addImage: "Nova imagem",
    },
    enums: {
      weight: {
        300: "Leve",
        400: "Normal",
        500: "Médio",
        600: "Seminegrito",
        700: "Negrito",
      },
    },
    help: {
      content: "A quebra de linha acontece por palavras; o excesso é cortado na caixa.",
      size: "De {min} a {max} pt.",
    },
  },
  picker: {
    title: "Escolher cor",
    saturation: "Saturação e brilho",
    hue: "Matiz",
    alpha: "Opacidade",
    hex: "Hexadecimal",
    eyedropper: "Conta-gotas",
    close: "Concluir",
    invalidHex: "Hexadecimal inválido.",
    open: "Abrir seletor de cor",
  },
  units: {
    millimetre: "mm",
    point: "pt",
  },
  warnings: {
    title: "Avisos",
    catalog: {
      "margin.belowHomePrint": "Margem menor que {limit} mm pode ser cortada pela impressora.",
      "cutmarks.margin.zero": "Sem marca de corte no lado com margem zero.",
      "ruling.areaTooSmall": "A área da pauta é menor que o mínimo e não foi gerada.",
      "image.tooLarge": "O arquivo passa de {maxBytes} MB e foi rejeitado.",
      "image.dimensions": "O lado maior passa de {maxSidePx} px. Reamostre a imagem.",
      "image.limitCount": "Máximo de {max} imagens por preset.",
      "image.lowPpi": "Resolução efetiva abaixo de {minPpi} ppi.",
      "text.overflow": "O texto foi cortado na caixa.",
      "text.limitCount": "Máximo de {max} caixas de texto por preset.",
      "font.loadFailed": "Não foi possível baixar a fonte. A exportação fica bloqueada.",
      "font.missingGlyph": "A fonte não tem todos os caracteres usados.",
      "storage.quota": "O navegador está sem espaço. Exporte o preset em JSON.",
      "import.invalid": "O arquivo importado não é um preset válido.",
      "export.failed": "A exportação falhou: {reason}",
      "object.outOfPage": "O objeto está totalmente fora da página.",
      "invalid.margin": "Margem fora do intervalo permitido.",
      "invalid.contentArea": "As margens deixam área útil pequena demais.",
    },
  },
};

/**
 * Look up a warning message by catalog code, filling {placeholders}.
 */
export function warningText(code, params = {}) {
  const template = strings.warnings.catalog[code] ?? code;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key]),
  );
}
