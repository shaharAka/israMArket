/**
 * isramarket/copy-spacing: translated copy glued to the value next to it.
 *
 * `<Copy text="שבוע" />{week}` renders "שבוע3", and `<Copy text="לפני כן:" />{n}` renders
 * "לפני כן:1,710": JSX adds no space between siblings. The rule looks at adjacent JSX
 * children where one side is translated copy written directly in the parent (`<Copy text>`,
 * a `t("…")` call or Hebrew/English JSX text) and reports when the left side ends in a word
 * or punctuation and the right side starts with a word or a value, with nothing between.
 *
 * Deliberate joins stay allowed: a Hebrew prefix letter written as its own word
 * ("פרטי ה" + kind, "התוכנית ל" + month), a maqaf or hyphen ("נקרא ב־" + date) and an
 * opening bracket ("(" + count). Text that starts with closing punctuation
 * (".", ",", ":", ")") needs no space before it. Elements that may be laid out as blocks
 * (a CSS-module class, a `block`/`flex`/`grid` utility, or a bare `<span>`/`<small>` that
 * a parent stylesheet can place on its own line) are not treated as running text.
 *
 * Fix: put the space in the JSX, e.g. `<Copy text="שבוע" /> {week}` or `{" "}` at a
 * line break. Do not add it inside the message, which would change its catalog ID.
 */

const PREFIX_JOIN = /(?:^|[\s·(,;:])[בהוכלמש]$/u;
const JOIN_END = /[־\-–(/[@#'"״׳]$/u;
const CLOSING_START = /^[.,:;!?)\]%…״׳'"]/u;

/** Babel/TypeScript JSX text cleaning: what the text renders as. */
function cleanJsxText(raw) {
  if (!/[\n\r]/.test(raw)) return raw;
  const lines = raw.split(/\r\n|\n|\r/);
  const kept = [];
  lines.forEach((line, index) => {
    let value = line.replace(/\t/g, " ");
    if (index !== 0) value = value.replace(/^[ ]+/, "");
    if (index !== lines.length - 1) value = value.replace(/[ ]+$/, "");
    if (value) kept.push(value);
  });
  return kept.join(" ");
}

const edge = (kind, copy = false) => ({ kind, copy });
const part = (lead, trail, direct) => ({ lead, trail, direct });
const UNKNOWN = part(edge("unknown"), edge("unknown"), false);
const EMPTY = part(edge("empty"), edge("empty"), true);
const isEmpty = p => p.lead.kind === "empty" && p.trail.kind === "empty";

function ofString(text, copy) {
  if (!text) return EMPTY;
  const lead = /^\s/u.test(text) ? "space" : CLOSING_START.test(text) ? "closing" : "word";
  const trail = /\s$/u.test(text) ? "space" : JOIN_END.test(text) || PREFIX_JOIN.test(text) ? "join" : "word";
  return part(edge(lead, copy), edge(trail, copy), true);
}

function literalText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked ?? "";
  return null;
}

const isT = node => node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "t";
const isCopyElement = node => node.type === "JSXElement" && node.openingElement.name.type === "JSXIdentifier" && node.openingElement.name.name === "Copy";

/** Either branch can render: a word on either side wins. */
function either(a, b) {
  const pick = (x, y) => {
    if (x.kind === "word" || y.kind === "word") return x.kind === "word" ? x : y;
    if (x.kind === "empty") return y;
    if (y.kind === "empty") return x;
    if (x.kind === "unknown" || y.kind === "unknown") return edge("unknown");
    return x;
  };
  return part(pick(a.lead, b.lead), pick(a.trail, b.trail), a.direct && b.direct);
}

const VALUE = part(edge("word"), edge("word"), true);

function ofExpression(node) {
  if (!node || node.type === "JSXEmptyExpression") return EMPTY;
  const text = literalText(node);
  if (text !== null) return ofString(text, false);
  if (node.type === "Literal" && (node.value === null || typeof node.value === "boolean")) return EMPTY;
  if (node.type === "Identifier" && node.name === "undefined") return EMPTY;
  if (node.type === "TemplateLiteral") {
    const first = node.quasis[0].value.cooked ?? "";
    const last = node.quasis.at(-1).value.cooked ?? "";
    return part(first ? ofString(first, false).lead : edge("word"), last ? ofString(last, false).trail : edge("word"), true);
  }
  if (isT(node)) {
    const message = literalText(node.arguments[0]);
    if (message === null) return part(edge("word", true), edge("word", true), true);
    return ofString(message.replace(/\{arg_\d+\}/g, "0"), true);
  }
  if (node.type === "ConditionalExpression") return either(ofExpression(node.consequent), ofExpression(node.alternate));
  if (node.type === "LogicalExpression") {
    return node.operator === "&&" ? either(EMPTY, ofExpression(node.right)) : either(ofExpression(node.left), ofExpression(node.right));
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") return ofElement(node);
  if (node.type === "ArrayExpression" || (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "map")) return UNKNOWN;
  return VALUE;
}

function ofCopy(node) {
  const attribute = node.openingElement.attributes.find(a => a.type === "JSXAttribute" && a.name.name === "text");
  if (!attribute?.value) return UNKNOWN;
  if (attribute.value.type === "Literal") return ofString(String(attribute.value.value), true);
  const text = literalText(attribute.value.expression);
  if (text !== null) return ofString(text, true);
  return part(edge("word", true), edge("word", true), true);
}

const TEXT_TAGS = new Set(["span", "b", "strong", "em", "i", "small", "bdi", "bdo", "code", "a", "Link", "mark", "u", "s", "time", "abbr", "sup", "sub"]);
// Without a class of their own these are still running text; a bare span/small often is not.
const BARE_TEXT_TAGS = new Set(["b", "strong", "em", "i", "bdi", "bdo", "code", "a", "Link", "mark", "u", "time", "abbr"]);
const LAYOUT_CLASS = /(?:^|[\s:])(?:block|flex|inline-flex|grid|inline-grid|inline-block|table|absolute|fixed|sticky|sr-only|hidden|contents)(?=$|\s)/;
// Text-level Tailwind utilities. A class outside this list (a stylesheet class) may change
// the element's layout, so it is not assumed to be running text.
const TEXT_UTILITY = /^(?:[a-z0-9-]+:)*-?(?:text|font|tabular|tracking|leading|m[sexytb]?|p[sexytb]?|w|h|min|max|shrink|grow|truncate|underline|decoration|no-underline|bg|rounded|opacity|whitespace|break|italic|not-italic|uppercase|lowercase|normal-case|align|tabular-nums|lining-nums|ring|shadow|outline|transition|duration|ease|cursor|select|line-clamp|order|self|justify-self|z|border|hover|focus|group|peer)(?:-|$|\[)/;

function classTokensAreText(value) {
  return value.split(/\s+/).filter(Boolean).every(token => TEXT_UTILITY.test(token));
}

function literalClassName(node) {
  const className = node.openingElement?.attributes.find(a => a.type === "JSXAttribute" && a.name.name === "className");
  if (!className) return { present: false };
  if (className.value?.type === "Literal") return { present: true, text: String(className.value.value) };
  const expression = className.value?.expression;
  if (expression?.type === "TemplateLiteral") return { present: true, text: expression.quasis.map(q => q.value.cooked ?? "").join(" "), partial: true };
  return { present: true };
}

/** Inline text-level elements only: block, flex and grid children never run together. */
function isRunningText(node) {
  if (node.type === "JSXFragment") return true;
  const name = node.openingElement.name;
  if (name.type !== "JSXIdentifier" || !TEXT_TAGS.has(name.name)) return false;
  const className = literalClassName(node);
  if (!className.present) return BARE_TEXT_TAGS.has(name.name);
  // A CSS-module or computed class may lay it out as a block.
  if (className.text === undefined || className.partial) return false;
  return !LAYOUT_CLASS.test(className.text) && classTokensAreText(className.text);
}

/** A flex or grid parent places each child on its own; nothing runs together inside it. */
function laysOutChildren(node) {
  if (node.type !== "JSXElement") return false;
  const className = literalClassName(node);
  return className.text !== undefined && /(?:^|[\s:])(?:flex|inline-flex|grid|inline-grid)(?=$|\s)/.test(className.text);
}

function ofElement(node) {
  if (isCopyElement(node)) return ofCopy(node);
  if (node.type === "JSXElement" && node.openingElement.name.name === "br") return part(edge("space"), edge("space"), false);
  if (!isRunningText(node)) return UNKNOWN;
  const parts = (node.children || []).map(ofChild).filter(p => !isEmpty(p));
  if (!parts.length) return UNKNOWN;
  return part(parts[0].lead, parts.at(-1).trail, false);
}

/** What a child renders as at its two edges, and whether it is written directly here. */
function ofChild(node) {
  if (node.type === "JSXText") {
    const text = cleanJsxText(node.value);
    return ofString(text, /\p{L}/u.test(text));
  }
  if (node.type === "JSXExpressionContainer") return ofExpression(node.expression);
  if (node.type === "JSXElement" || node.type === "JSXFragment") return ofElement(node);
  return UNKNOWN;
}

export const copySpacing = {
  meta: {
    type: "problem",
    docs: { description: "Require a space between translated copy and the value or word next to it" },
    messages: {
      glued: "Translated copy is glued to the next word or value (renders like \"שבוע3\"). Add a space in the JSX, e.g. `<Copy text=\"…\" /> {value}` or `{\" \"}`.",
    },
    schema: [],
  },
  create(context) {
    // In a flex or grid parent every child element is its own item, but neighbouring text
    // (copy and values) still forms one run, so only text-to-text seams are checked there.
    function check(children, itemsAreBoxes) {
      const items = children.map(node => ({ node, part: ofChild(node) })).filter(item => !isEmpty(item.part));
      for (let i = 0; i + 1 < items.length; i++) {
        const left = items[i].part, right = items[i + 1].part;
        if (left.trail.kind !== "word" || right.lead.kind !== "word") continue;
        if (itemsAreBoxes && !(left.direct && right.direct)) continue;
        const copyAtSeam = (left.direct && left.trail.copy) || (right.direct && right.lead.copy);
        if (!copyAtSeam) continue;
        context.report({ node: items[i + 1].node, messageId: "glued" });
      }
    }
    return {
      JSXElement(node) { if (!isCopyElement(node)) check(node.children, laysOutChildren(node)); },
      JSXFragment(node) { check(node.children, false); },
    };
  },
};

const plugin = { rules: { "copy-spacing": copySpacing } };
export default plugin;
