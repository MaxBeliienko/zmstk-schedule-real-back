const {
  AlignmentType,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  ShadingType,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} = require("docx");
const { DOCUMENT_APPROVER } = require("../config/documents");

// Оформлення документа "Графік черговості навчання водінню" — повторює
// паперовий бланк автошколи: А4 альбомна, Times New Roman, шапка
// "ЗАТВЕРДЖУЮ", таблиці по 14 навчальних днів (кожна — з нової сторінки).
// Розміри в docx: шрифт — у півпунктах (28 = 14 pt), відстані — у DXA
// (1/20 pt, 567 ≈ 1 см).

const DAYS_PER_TABLE = 14;
const NUMBER_COL = 537;
const NAME_COL = 2508;
// 14 колонок днів = 13 155 DXA; остання трохи вужча, щоб сума зійшлася
const DAY_COLS = [...Array(DAYS_PER_TABLE - 1).fill(940), 935];
const TABLE_WIDTH = NUMBER_COL + NAME_COL + DAY_COLS.reduce((a, b) => a + b, 0);
const DAYS_WIDTH = TABLE_WIDTH - NUMBER_COL - NAME_COL;

const COLOR_DATE = "FF0000";
const COLOR_LESSON = "C00000";
// Смуги курсантів по черзі (білий / світло-сірий) — щоб легше читати рядки
const STRIPE_FILL = "E7E6E6";
// Кольори рядків "Автомобіль ..." по черзі — як у паперовому графіку
const VEHICLE_COLORS = ["4F6228", "403152", "984806", "17365D"];

const text = (value, opts = {}) => new TextRun({ text: value, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    ...opts,
    children: Array.isArray(children) ? children : [children],
  });

function cell(paragraphs, { width, span, merge, fill, vAlign = VerticalAlign.CENTER } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    columnSpan: span,
    verticalMerge: merge,
    verticalAlign: vAlign,
    children: paragraphs.length ? paragraphs : [para([])],
  });
}

const row = (cells, { height, header } = {}) =>
  new TableRow({
    children: cells,
    tableHeader: header,
    cantSplit: true,
    height: height ? { value: height, rule: HeightRule.ATLEAST } : undefined,
  });

// Клітинки днів одного рядка; недостачу в останній таблиці доповнюємо порожніми
const dayCells = (days, render, fill) =>
  DAY_COLS.map((width, i) => cell(i < days.length ? render(days[i], i) : [], { width, fill }));

function headerRows(days, firstDayNumber) {
  const numberHeader = (merge, children = []) =>
    cell(children, { width: NUMBER_COL, merge });
  const nameHeader = (merge, children = []) => cell(children, { width: NAME_COL, merge });

  return [
    row(
      [
        numberHeader(VerticalMergeType.RESTART, [para(text("№п/п", { bold: true, size: 28 }))]),
        nameHeader(VerticalMergeType.RESTART, [
          para(text("Прізвище, ініціали слухача", { bold: true, size: 28 })),
        ]),
        cell([para(text("Навчальні дні", { size: 32 }))], {
          width: DAYS_WIDTH,
          span: DAYS_PER_TABLE,
        }),
      ],
      { header: true }
    ),
    row(
      [
        numberHeader(VerticalMergeType.CONTINUE),
        nameHeader(VerticalMergeType.CONTINUE),
        ...dayCells(days, (_, i) => [para(text(String(firstDayNumber + i)))]),
      ],
      { height: 269, header: true }
    ),
    row(
      [
        numberHeader(VerticalMergeType.CONTINUE),
        nameHeader(VerticalMergeType.CONTINUE),
        cell([para(text("Дата проведення занять", { size: 28 }))], {
          width: DAYS_WIDTH,
          span: DAYS_PER_TABLE,
        }),
      ],
      { height: 403, header: true }
    ),
    row(
      [
        numberHeader(VerticalMergeType.CONTINUE),
        nameHeader(VerticalMergeType.CONTINUE),
        ...dayCells(days, (day) => [
          para(text(day.label, { bold: true, size: 28, color: COLOR_DATE })),
        ]),
      ],
      { height: 323, header: true }
    ),
  ];
}

function vehicleRow(vehicle, color) {
  const style = { bold: true, italics: true, color, size: 28 };
  const runs = vehicle.vehicleLabel
    ? [text(`Автомобіль  ${vehicle.vehicleLabel}`, style)]
    : [text("Транспортний засіб не призначено", style)];
  if (vehicle.trailerLabel) runs.push(text(`, причіп ${vehicle.trailerLabel}`, style));
  if (vehicle.instructorNames.length) {
    runs.push(text(",  ", style));
    runs.push(text(`інструктор  ${vehicle.instructorNames.join(", ")}`, { ...style, size: 32 }));
  }
  return row(
    [
      cell([], { width: NUMBER_COL }),
      cell([], { width: NAME_COL }),
      cell([para(runs)], { width: DAYS_WIDTH, span: DAYS_PER_TABLE }),
    ],
    { height: 578 }
  );
}

const lessonText = (value, extra = {}) =>
  text(value, { size: 20, color: COLOR_LESSON, ...extra });

function studentRows(student, days) {
  const timeCell = (day) =>
    (student?.cells[day.date]?.times || []).map((t) => para(lessonText(t)));
  const exerciseCell = (day) =>
    (student?.cells[day.date]?.exercises || []).flatMap((ex) => [
      para(lessonText(ex.code, { bold: ex.code === "ІСПИТ" })),
      ...ex.notes.map((note) => para(lessonText(note, { size: 18, bold: true }))),
    ]);
  // Парні курсанти — на сірому тлі; номер наскрізний, тож смуги однакові на всіх сторінках
  const fill = student && student.number % 2 === 0 ? STRIPE_FILL : undefined;

  return [
    row(
      [
        cell(student ? [para(text(String(student.number), { bold: true }))] : [], {
          width: NUMBER_COL,
          merge: VerticalMergeType.RESTART,
          fill,
        }),
        cell(
          student
            ? [para(text(student.name, { bold: true }), { alignment: AlignmentType.LEFT })]
            : [],
          { width: NAME_COL, merge: VerticalMergeType.RESTART, fill }
        ),
        ...dayCells(days, timeCell, fill),
      ],
      { height: 284 }
    ),
    row(
      [
        cell([], { width: NUMBER_COL, merge: VerticalMergeType.CONTINUE, fill }),
        cell([], { width: NAME_COL, merge: VerticalMergeType.CONTINUE, fill }),
        ...dayCells(days, exerciseCell, fill),
      ],
      { height: 284 }
    ),
  ];
}

function scheduleTable(model, days, firstDayNumber) {
  const rows = [...headerRows(days, firstDayNumber)];
  model.vehicles.forEach((vehicle, i) => {
    rows.push(vehicleRow(vehicle, VEHICLE_COLORS[i % VEHICLE_COLORS.length]));
    for (const student of vehicle.students) rows.push(...studentRows(student, days));
  });
  // Порожній рядок унизу — дописати курсанта від руки, як у бланку
  rows.push(...studentRows(null, days));

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [NUMBER_COL, NAME_COL, ...DAY_COLS],
    layout: TableLayoutType.FIXED,
    // Таблиця ширша за поля сторінки — як у паперовому бланку
    indent: { size: -792, type: WidthType.DXA },
    rows,
  });
}

function titleBlock(model) {
  const bold = (value, size) => text(value, { bold: true, size });
  const underlined = (value, size) =>
    text(value, { bold: true, size, underline: { type: UnderlineType.SINGLE } });
  const categoryWord = model.categories.length > 1 ? "категорій" : "категорії";
  // Блок "ЗАТВЕРДЖУЮ" — у правій частині сторінки
  const approver = (value, size) =>
    para(bold(value, size), { alignment: AlignmentType.LEFT, indent: { left: 9200 } });

  return [
    approver("ЗАТВЕРДЖУЮ:", 44),
    approver(DOCUMENT_APPROVER.position, 32),
    approver(DOCUMENT_APPROVER.organization, 32),
    approver(`_______${DOCUMENT_APPROVER.name}`, 32),
    para(bold("Г Р А Ф І К", 40), { spacing: { before: 120 } }),
    para([
      underlined(`черговості навчання водінню транспортних засобів ${categoryWord} `, 28),
      underlined(model.categories.join(", ") || "—", 52),
      underlined(" слухачів групи № ", 28),
      underlined(model.group, 52),
    ]),
    para(
      underlined(`з  ${model.periodLabel.from} року  по  ${model.periodLabel.to} року`, 32),
      { spacing: { after: 120 } }
    ),
  ];
}

async function renderGroupScheduleDocx(model) {
  const children = [...titleBlock(model)];
  // Хоча б одна таблиця — навіть якщо днів немає (порожній бланк)
  const chunks = Math.max(1, Math.ceil(model.days.length / DAYS_PER_TABLE));
  for (let i = 0; i < chunks; i += 1) {
    const days = model.days.slice(i * DAYS_PER_TABLE, (i + 1) * DAYS_PER_TABLE);
    // Наступна частина таблиці — з нової сторінки
    if (i > 0) children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    children.push(scheduleTable(model, days, i * DAYS_PER_TABLE + 1));
  }
  children.push(new Paragraph({ children: [] }));

  const doc = new Document({
    creator: "ЗМСТК — розклад",
    title: `Графік групи № ${model.group}`,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
    },
    sections: [
      {
        properties: {
          page: {
            // docx сам міняє ширину й висоту місцями для альбомної орієнтації
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 142, right: 1134, bottom: 360, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderGroupScheduleDocx, DAYS_PER_TABLE };
