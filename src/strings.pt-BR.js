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
