document.getElementById("viewer");
var e = document.getElementById("chapters"), t = document.getElementById("status");
function n() {
	return document.scrollingElement ?? document.documentElement;
}
function r() {
	let e = n(), t = e.scrollHeight - e.clientHeight;
	return t > 0 ? Math.max(0, Math.min(100, e.scrollTop / t * 100)) : 0;
}
//#endregion
//#region src/locale.ts
var i = {
	ru: {
		opening: "Открытие книги…",
		openFailed: "Не удалось открыть книгу: ",
		footnoteBack: "Вернуться к месту чтения"
	},
	en: {
		opening: "Opening the book…",
		openFailed: "Failed to open the book: ",
		footnoteBack: "Back to the reading position"
	}
}, a = "ru";
function o(e) {
	a = e in i ? e : "ru";
}
function s(e) {
	return i[a]?.[e] ?? i.ru[e] ?? e;
}
//#endregion
//#region src/book-link.ts
function c(e) {
	let t = (e ?? "").trim();
	if (!t) return {
		kind: "ignored",
		href: t
	};
	let n = t.indexOf("#");
	if (n >= 0) {
		let e = t.slice(n + 1).trim();
		return e && (n === 0 || !/^[a-z][a-z0-9+.-]*:/i.test(t)) ? {
			kind: "anchor",
			href: t,
			anchor: e
		} : {
			kind: "ignored",
			href: t
		};
	}
	let r = t.toLowerCase();
	return r.startsWith("http://") || r.startsWith("https://") || r.startsWith("mailto:") ? {
		kind: "external",
		href: t
	} : {
		kind: "ignored",
		href: t
	};
}
function l(e, t) {
	let n = e.getElementById(t);
	if (n) return n;
	for (let n of e.querySelectorAll("[id]")) if (n.id === t) return n;
	return null;
}
var u = "context-footnote-back", d = "data-context-noteref";
function f(e) {
	if (e.classList.contains("fb2-note") || e.hasAttribute("data-context-noteref")) return !0;
	let t = e.getAttribute("epub:type") ?? "";
	return /(^|\s)noteref(\s|$)/.test(t) ? !0 : e.getAttribute("role") === "doc-noteref";
}
function ee(e) {
	let t = e.split("#")[0] ?? "";
	return t ? /(^|[\\/_.-])(notes?|footnotes?|endnotes?)([\\/_.-]|$)/i.test(t) : !1;
}
function p(e) {
	if (e.classList.contains("fb2-notes")) return !0;
	let t = e.getAttribute("epub:type") ?? "";
	if (/(^|\s)(footnotes|endnotes)(\s|$)/.test(t)) return !0;
	let n = e.getAttribute("role") ?? "";
	return n === "doc-footnotes" || n === "doc-endnotes";
}
function m(e) {
	if (p(e)) return !1;
	let t = e.getAttribute("epub:type") ?? "";
	if (/(^|\s)(footnote|endnote)(\s|$)/.test(t)) return !0;
	let n = e.getAttribute("role") ?? "";
	return n === "doc-footnote" || n === "doc-endnote" || /(^|[\s_-])(footnote|endnote)([\s_-]|$)/i.test(typeof e.className == "string" ? e.className : "");
}
function h(e) {
	let t = e, n = null;
	for (; t;) {
		if (m(t)) return t;
		if (p(t)) {
			n = t;
			break;
		}
		t = t.parentElement;
	}
	if (!n) return null;
	let r = e;
	for (; r && r !== n;) {
		if (r.id) return r;
		r = r.parentElement;
	}
	let i = e;
	for (; i?.parentElement && i.parentElement !== n;) i = i.parentElement;
	return i === n ? null : i;
}
function te(e) {
	let t = e;
	for (; t;) {
		if (t.id) return t;
		t = t.parentElement;
	}
	return e;
}
var ne = "p,li,dd,dt,blockquote,aside,section,article,div,td,th,figure";
function re(e) {
	let t = e.tagName;
	if (![
		"A",
		"SPAN",
		"SUP",
		"SUB",
		"EM",
		"STRONG",
		"I",
		"B",
		"SMALL"
	].includes(t)) return e;
	let n = e.closest(ne);
	return n && n.tagName !== "BODY" ? n : e;
}
function g(e) {
	return Array.from(e.querySelectorAll("a[href]"));
}
function ie(e, t, n) {
	let r = te(t);
	for (let t of g(r)) {
		if (t === e) continue;
		let r = c(t.getAttribute("href"));
		if (r.kind !== "anchor" || !r.anchor) continue;
		let i = l(n, r.anchor);
		if (i && (i === e || i.contains(e) || e.contains(i))) return !0;
	}
	return !1;
}
function ae(e) {
	return /^(n|fn|fnt|note|footnote|endnote|fnref|noteref)[-_.]?\d+$/i.test(e.trim());
}
function oe(e) {
	let t = (e.textContent ?? "").trim();
	return /^\[?\d{1,3}\]?$/.test(t);
}
function se(e, t) {
	let n = e.getAttribute("href") ?? "", r = c(n);
	if (r.kind !== "anchor" || !r.anchor || h(e)) return null;
	let i = l(t, r.anchor);
	if (!i || e.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_PRECEDING) return null;
	let a = re(i), o = h(a) ?? h(i);
	return o ? {
		anchor: r.anchor,
		target: re(o)
	} : f(e) || ee(n) || ie(e, a, t) || ae(r.anchor) && oe(e) ? {
		anchor: r.anchor,
		target: a
	} : null;
}
var ce = /* @__PURE__ */ new Set([
	"script",
	"style",
	"link",
	"iframe",
	"object",
	"embed",
	"form",
	"input",
	"button",
	"textarea",
	"select"
]);
function le(e) {
	return /^data:image\//i.test(e.trim());
}
function ue(e) {
	for (let t of Array.from(e.querySelectorAll("*"))) {
		if (t.classList.contains("context-footnote-back")) {
			t.remove();
			continue;
		}
		if (ce.has(t.tagName.toLowerCase())) {
			t.remove();
			continue;
		}
		for (let e of Array.from(t.attributes)) {
			let n = e.name.toLowerCase();
			if (n === "href") {
				t.removeAttribute(e.name);
				continue;
			}
			(n.startsWith("on") || (n === "src" || n === "srcset") && !le(e.value)) && t.removeAttribute(e.name);
		}
	}
}
function de(e) {
	let t = e.cloneNode(!0);
	return ue(t), t.innerHTML;
}
function fe(e, t) {
	let n = e.createElement("a");
	return n.className = u, n.setAttribute("href", `#${t}`), n.setAttribute("title", s("footnoteBack")), n.textContent = "↩", n;
}
function pe(e, t, n) {
	if (t.id) return t.id;
	let r = `context-noteref-${n}`, i = r, a = 1;
	for (; e.getElementById(i);) a += 1, i = `${r}-${a}`;
	return t.id = i, t.setAttribute(d, ""), i;
}
function me(e, t) {
	for (let n of g(e)) {
		let e = c(n.getAttribute("href"));
		if (e.kind !== "anchor" || !e.anchor) continue;
		let r = l(t, e.anchor);
		if (r && !r.closest(".fb2-notes") && !m(r)) return !0;
	}
	return !1;
}
function he(e) {
	let t = /* @__PURE__ */ new Set(), n = 0;
	for (let r of Array.from(e.querySelectorAll("a[href]"))) {
		if (r.classList.contains("context-footnote-back")) continue;
		let i = se(r, e);
		i && !t.has(i.target) && (t.add(i.target), !i.target.querySelector(".context-footnote-back") && (me(i.target, e) || (i.target.append(fe(e, pe(e, r, i.anchor))), n += 1)));
	}
	return n;
}
//#endregion
//#region src/search-mark.ts
var _ = "context-search-hit", v = "context-search-hit-active";
function y(e) {
	for (let t of Array.from(e.querySelectorAll(`mark.${_}`))) {
		let e = t.parentNode;
		if (e) {
			for (; t.firstChild;) e.insertBefore(t.firstChild, t);
			e.removeChild(t);
		}
	}
}
function ge(e) {
	let t = e.ownerDocument;
	if (!t) return [];
	let n = t.createTreeWalker(e, NodeFilter.SHOW_TEXT), r = [], i = 0, a = n.nextNode();
	for (; a;) {
		let e = a, t = e.nodeValue?.length ?? 0;
		r.push({
			node: e,
			start: i,
			length: t
		}), i += t, a = n.nextNode();
	}
	return r;
}
function _e(e, t) {
	if (e.length === 0) return null;
	let n = 0, r = e.length - 1;
	for (; n < r;) {
		let i = Math.ceil((n + r) / 2);
		e[i].start <= t ? n = i : r = i - 1;
	}
	let i = e[n];
	return t < i.start || t > i.start + i.length ? null : {
		node: i.node,
		offset: t - i.start
	};
}
function ve(e, t, n = null) {
	let r = e.ownerDocument;
	if (!r || t.length === 0) return !1;
	let i = ge(e);
	if (i.length === 0) return !1;
	let a = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = _e(i, e.start), n = _e(i, e.end);
		if (!t || !n) continue;
		let r = t.node, o = n.node;
		if (r === o) {
			b(a, r, t.offset, n.offset, e.start);
			continue;
		}
		let s = !1;
		for (let c of i) {
			if (c.node === r) {
				s = !0, b(a, c.node, t.offset, c.length, e.start);
				continue;
			}
			if (s) {
				if (c.node === o) {
					b(a, c.node, 0, n.offset, e.start);
					break;
				}
				b(a, c.node, 0, c.length, e.start);
			}
		}
	}
	let o = !1;
	for (let [e, t] of a) {
		let i = e.nodeValue ?? "", a = [...t].filter((e) => e.to > e.from).sort((e, t) => e.from - t.from);
		if (a.length === 0) continue;
		let s = r.createDocumentFragment(), c = 0;
		for (let e of a) {
			let t = Math.max(c, Math.min(e.from, i.length)), a = Math.max(t, Math.min(e.to, i.length));
			if (t > c && s.append(i.slice(c, t)), a > t) {
				let c = r.createElement("mark");
				c.dataset.start = String(e.start), c.className = e.start === n ? `${_} ${v}` : _, c.textContent = i.slice(t, a), s.append(c), o = !0;
			}
			c = Math.max(c, a);
		}
		c < i.length && s.append(i.slice(c)), e.replaceWith(s);
	}
	return o;
}
function b(e, t, n, r, i) {
	let a = e.get(t);
	a ? a.push({
		from: n,
		to: r,
		start: i
	}) : e.set(t, [{
		from: n,
		to: r,
		start: i
	}]);
}
//#endregion
//#region src/document.ts
var x = "context-chapter", S = "context-note", C = "context-note-flash", w = "context-footnote-flash", ye = "context-resize-preview", T = "context-selection-layer", E = "context-selection-band", be = [
	"html{font-size:100%;position:relative;}",
	"body{margin:0 auto !important;width:100% !important;",
	"max-width:48rem !important;padding:1.5rem 2rem !important;box-sizing:border-box;}",
	"body{background:var(--rt-background);color:var(--rt-foreground);line-height:1.6;",
	"font-family:var(--rt-font);}",
	"img{max-width:100%;height:auto;}",
	"h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.4em 0 0.6em;font-weight:600;}",
	"h1{font-size:1.8em;}",
	"h2{font-size:1.5em;}",
	"h3{font-size:1.3em;}",
	"h4{font-size:1.15em;}",
	"h5,h6{font-size:1em;}",
	"p{margin:0.7em 0;text-align:justify;hyphens:auto;}",
	"h1+p,h2+p,h3+p,h4+p,h5+p,h6+p{text-indent:0;}",
	"blockquote{margin:1em 0 1em 1.5em;padding-left:1em;",
	"border-left:2px solid var(--rt-muted);color:var(--rt-muted);font-style:italic;}",
	"ul,ol{margin:0.8em 0;padding-left:1.6em;}",
	"li{margin:0.3em 0;}",
	"hr{border:0;border-top:1px solid var(--rt-muted);margin:1.6em 0;}",
	"table{border-collapse:collapse;margin:1em 0;max-width:100%;}",
	"td,th{padding:0.3em 0.6em;border:1px solid var(--rt-muted);}",
	"pre{white-space:pre-wrap;overflow-wrap:break-word;}",
	"code,kbd,pre{font-family:ui-monospace,monospace;font-size:0.92em;}",
	"sup,sub{line-height:0;}",
	"a{color:var(--rt-link);}",
	"small,figcaption{color:var(--rt-muted);font-size:0.9em;}",
	"figure{margin:1em 0;}",
	"body[data-tool=\"text\"],body[data-tool=\"shape\"]{cursor:crosshair;user-select:none;}",
	"body[data-tool=\"text\"] *,body[data-tool=\"shape\"] *{cursor:crosshair;}",
	"body[data-tool=\"text\"] .context-note-card,body[data-tool=\"shape\"] .context-note-card,",
	"body[data-tool=\"text\"] mark.context-note,body[data-tool=\"shape\"] mark.context-note,",
	"body[data-tool=\"text\"] .context-note-shape path,body[data-tool=\"shape\"] .context-note-shape path",
	"{cursor:pointer !important;}",
	"::selection{background:transparent;}",
	`.${T}{position:absolute;left:0;top:0;pointer-events:none;z-index:1;`,
	"mix-blend-mode:multiply;}",
	`html[data-reader-theme='dark'] .${T}{mix-blend-mode:screen;}`,
	`.${E}{position:absolute;border-radius:2px;background:var(--rt-selection);}`,
	`.${E}::before,.${E}::after{content:none;position:absolute;`,
	"top:-0.5px;bottom:-0.5px;width:var(--rt-selection-edge-width,1px);",
	"background:var(--rt-selection-edge);border-radius:calc(0.5 * var(--rt-selection-edge-width,1px));}",
	`.${E}[data-edge="start"]::before,`,
	`.${E}[data-edge="both"]::before{content:"";`,
	"left:calc(-0.5 * var(--rt-selection-edge-width,1px));}",
	`.${E}[data-edge="end"]::after,`,
	`.${E}[data-edge="both"]::after{content:"";`,
	"right:calc(-0.5 * var(--rt-selection-edge-width,1px));}",
	`.${S}{border-radius:2px;cursor:pointer;color:inherit;`,
	"box-decoration-break:clone;-webkit-box-decoration-break:clone;}",
	`.${S}[data-color="yellow"]{background:var(--note-solid-yellow);}`,
	`.${S}[data-color="green"]{background:var(--note-solid-green);}`,
	`.${S}[data-color="blue"]{background:var(--note-solid-blue);}`,
	`.${S}[data-color="red"]{background:var(--note-solid-red);}`,
	`.${S}[data-color="purple"]{background:var(--note-solid-purple);}`,
	`.${x}{position:relative;}`,
	".context-note-card{position:absolute;max-width:220px;padding:6px 8px;border-radius:6px;",
	"font-size:13px;line-height:1.4;white-space:pre-wrap;cursor:pointer;z-index:2;}",
	".context-note-card[data-color=\"yellow\"]{background:var(--note-yellow);}",
	".context-note-card[data-color=\"green\"]{background:var(--note-green);}",
	".context-note-card[data-color=\"blue\"]{background:var(--note-blue);}",
	".context-note-card[data-color=\"red\"]{background:var(--note-red);}",
	".context-note-card[data-color=\"purple\"]{background:var(--note-purple);}",
	".context-note-shape{position:absolute;pointer-events:none;overflow:visible;",
	"mix-blend-mode:multiply;}",
	".context-note-shape rect,.context-note-shape ellipse{stroke:none;fill-opacity:0.5;",
	"vector-effect:non-scaling-stroke;pointer-events:none;}",
	".context-note-shape line{fill:none;stroke-width:4;stroke-opacity:0.6;",
	"vector-effect:non-scaling-stroke;pointer-events:none;}",
	".context-note-shape path{fill:transparent;stroke:transparent;stroke-width:16;",
	"vector-effect:non-scaling-stroke;pointer-events:all;cursor:pointer;}",
	".context-note-preview{position:absolute;z-index:3;pointer-events:none;",
	"border:1px dashed #2563eb;box-sizing:border-box;}",
	".context-note-preview::before{content:\"\";position:absolute;left:0;right:0;top:50%;",
	"height:1px;background:#2563eb;opacity:0.6;}",
	".context-note-preview::after{content:\"\";position:absolute;top:0;bottom:0;left:50%;",
	"width:1px;background:#2563eb;opacity:0.6;}",
	".context-note-shape[data-color=\"yellow\"] rect,",
	".context-note-shape[data-color=\"yellow\"] ellipse{fill:var(--note-yellow);}",
	".context-note-shape[data-color=\"yellow\"] line{stroke:var(--note-yellow);}",
	".context-note-shape[data-color=\"green\"] rect,",
	".context-note-shape[data-color=\"green\"] ellipse{fill:var(--note-green);}",
	".context-note-shape[data-color=\"green\"] line{stroke:var(--note-green);}",
	".context-note-shape[data-color=\"blue\"] rect,",
	".context-note-shape[data-color=\"blue\"] ellipse{fill:var(--note-blue);}",
	".context-note-shape[data-color=\"blue\"] line{stroke:var(--note-blue);}",
	".context-note-shape[data-color=\"red\"] rect,",
	".context-note-shape[data-color=\"red\"] ellipse{fill:var(--note-red);}",
	".context-note-shape[data-color=\"red\"] line{stroke:var(--note-red);}",
	".context-note-shape[data-color=\"purple\"] rect,",
	".context-note-shape[data-color=\"purple\"] ellipse{fill:var(--note-purple);}",
	".context-note-shape[data-color=\"purple\"] line{stroke:var(--note-purple);}",
	`.${S}.${C}{background:#f59e0b;}`,
	`.${S}.${v}{background:var(--rt-search-active);}`,
	`.${_}{border-radius:2px;background:var(--rt-search);`,
	"color:inherit;box-decoration-break:clone;-webkit-box-decoration-break:clone;}",
	`.${_}.${v}{background:var(--rt-search-active);}`,
	`.context-overlay.${C}{opacity:0.4;}`,
	`.${w}{background:#f59e0b;border-radius:2px;}`,
	`.${u}{font-size:0.85em;margin-left:0.35em;text-decoration:none;`,
	"vertical-align:super;line-height:0;opacity:0.65;}",
	`.${u}:hover{opacity:1;}`,
	"body[data-editing=\"move\"]{cursor:move;}",
	"body[data-editing=\"move\"] .context-overlay{cursor:move;}",
	"body[data-editing=\"resize\"],body[data-editing=\"resize\"] *{cursor:ew-resize;}",
	".context-note-handle{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;",
	"border-radius:50%;background:#1d4ed8;border:2px solid #fff;",
	"box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:ew-resize;z-index:5;}",
	`.${ye}{position:absolute;pointer-events:none;opacity:0.45;z-index:1;}`
].join("");
function xe() {
	return be;
}
var Se = [
	"yellow",
	"green",
	"blue",
	"red",
	"purple"
];
function Ce(e, t) {
	let n = t.tokens ?? {}, r = (t, n) => {
		n != null && n !== "" && e.style.setProperty(t, String(n));
	};
	r("--rt-background", n.background), r("--rt-foreground", n.text), r("--rt-muted", n.muted), r("--rt-link", n.link), r("--rt-selection", n.selection), r("--rt-selection-edge", n.selectionEdge), n.selectionEdgeWidth !== void 0 && n.selectionEdgeWidth !== null && r("--rt-selection-edge-width", `${n.selectionEdgeWidth}px`), r("--rt-search", n.search), r("--rt-search-active", n.searchActive), r("--rt-font", t.font), (t.fontId === "serif" || t.fontId === "sans") && (e.dataset.readerFont = t.fontId);
	let i = t.notes ?? {}, a = t.solid ?? {};
	for (let e of Se) r(`--note-${e}`, i[e]), r(`--note-solid-${e}`, a[e] ?? i[e]);
	(t.id === "dark" || t.id === "light") && (e.dataset.readerTheme = t.id);
}
function D(e) {
	let t = e.kind === "page" ? "page" : e.kind === "point" ? "point" : "text", n = {
		v: 1,
		kind: t,
		chapter: Number.isFinite(e.chapter) ? Number(e.chapter) : 0,
		start: Number.isFinite(e.start) ? Math.max(0, Number(e.start)) : 0,
		end: Number.isFinite(e.end) ? Math.max(0, Number(e.end)) : 0,
		quote: String(e.quote ?? ""),
		percent: Number.isFinite(e.percent) ? Number(e.percent) : 0,
		page: Number.isFinite(e.page) ? Number(e.page) : null
	};
	return t === "page" && (n.rects = we(e.rects)), t === "point" && (n.x = Number.isFinite(e.x) ? Number(e.x) : 0, n.y = Number.isFinite(e.y) ? Number(e.y) : 0), n;
}
function we(e) {
	if (!Array.isArray(e)) return [];
	let t = [];
	for (let n of e) {
		let e = n ?? {}, r = Number(e.x), i = Number(e.y), a = Number(e.width), o = Number(e.height);
		[
			r,
			i,
			a,
			o
		].every((e) => Number.isFinite(e)) && t.push({
			x: r,
			y: i,
			width: Math.max(0, a),
			height: Math.max(0, o)
		});
	}
	return t;
}
function O(e) {
	if (!e) return null;
	try {
		let t = JSON.parse(e);
		if (typeof t != "object" || !t) return null;
		let n = t.kind === "page", r = t.kind === "point";
		return r && (typeof t.x != "number" || typeof t.y != "number") || !n && !r && (typeof t.chapter != "number" || typeof t.start != "number") ? null : D(t);
	} catch {
		return null;
	}
}
function Te(e, t, n, r) {
	let i = e.createRange();
	return i.setStart(t, 0), i.setEnd(n, r), i.toString().length;
}
function Ee(e, t) {
	let n = e.ownerDocument;
	if (!n || !e.contains(t.startContainer) || !e.contains(t.endContainer)) return null;
	let r = Te(n, e, t.startContainer, t.startOffset), i = Te(n, e, t.endContainer, t.endOffset);
	return i <= r ? null : {
		start: r,
		end: i
	};
}
var De = /* @__PURE__ */ new WeakMap();
function Oe(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function ke(e) {
	let t = e.trim().split(/\s+/).filter((e) => e.length > 0).map(Oe);
	return t.length === 0 ? null : new RegExp(t.join("\\s+"));
}
function Ae(e) {
	return k(e)?.raw ?? null;
}
function k(e) {
	let t = e.ownerDocument;
	if (!t) return null;
	let n = e.textContent?.length ?? 0, r = De.get(e);
	if (r && r.length === n) return r;
	let i = t.createTreeWalker(e, NodeFilter.SHOW_TEXT), a = [], o = i.nextNode();
	for (; o;) a.push(o.nodeValue ?? ""), o = i.nextNode();
	let s = a.join(""), c = {
		raw: s,
		length: s.length
	};
	return De.set(e, c), c;
}
function A(e) {
	return e.replace(/\s+/g, " ").trim();
}
function je(e, t) {
	let n = ke(t);
	if (!n) return null;
	let r = k(e);
	if (!r) return null;
	let i = n.exec(r.raw);
	if (!i || i[0].length === 0) return null;
	let a = i.index, o = a + i[0].length, s = M(e, a, o);
	return s ? {
		range: s,
		start: a,
		end: o,
		byText: !0
	} : null;
}
function j(e, t) {
	if (t.kind !== "text") return null;
	let n = M(e, t.start, t.end), r = A(t.quote);
	if (n && !n.collapsed) {
		let e = A(n.toString());
		if (e.length > 0 && (e === r || e.startsWith(r) || r.startsWith(e))) return {
			range: n,
			start: t.start,
			end: t.end,
			byText: !1
		};
	}
	return je(e, t.quote);
}
function M(e, t, n) {
	let r = e.ownerDocument;
	if (!r) return null;
	let i = r.createTreeWalker(e, NodeFilter.SHOW_TEXT), a = 0, o = null, s = 0, c = null, l = 0, u = i.nextNode();
	for (; u;) {
		let e = u.nodeValue?.length ?? 0;
		if (!o && t <= a + e && (o = u, s = t - a), n <= a + e) {
			c = u, l = n - a;
			break;
		}
		a += e, u = i.nextNode();
	}
	if (!o || !c) return null;
	try {
		let e = r.createRange();
		return e.setStart(o, s), e.setEnd(c, l), e;
	} catch {
		return null;
	}
}
//#endregion
//#region src/highlight.ts
function N(e, t) {
	for (let n of Array.from(e.querySelectorAll(t))) {
		let e = n.parentNode;
		if (e) {
			for (; n.firstChild;) e.insertBefore(n.firstChild, n);
			e.removeChild(n);
		}
	}
}
function Me(e, t, n, r, i, a = "yellow") {
	let o = e.ownerDocument;
	if (!o || n <= t) return !1;
	let s = [], c = o.createTreeWalker(e, NodeFilter.SHOW_TEXT), l = 0, u = c.nextNode();
	for (; u;) {
		let e = u, r = e.nodeValue?.length ?? 0, i = l, a = l + r;
		l = a;
		let o = Math.max(t, i), d = Math.min(n, a);
		o < d && s.push({
			node: e,
			from: o - i,
			to: d - i
		}), u = c.nextNode();
	}
	for (let e of s) {
		let t = o.createRange();
		t.setStart(e.node, e.from), t.setEnd(e.node, e.to);
		let n = o.createElement("mark");
		n.className = r, n.dataset.noteId = i, n.dataset.color = a, t.surroundContents(n), Ne(n);
	}
	return s.length > 0;
}
function Ne(e) {
	let t = e.ownerDocument.defaultView, n = e.parentElement, r = t && n ? t.getComputedStyle(n) : null, i = r ? Number.parseFloat(r.lineHeight) : NaN, a = r ? Number.parseFloat(r.fontSize) : NaN, o = e.getClientRects()[0];
	if (!r || !Number.isFinite(i) || !Number.isFinite(a) || a <= 0 || !o || o.height <= 0) return;
	let s = (i - o.height) / 2 / a;
	if (s > 0) {
		let t = s + .25 / a;
		e.style.paddingTop = `${t}em`, e.style.paddingBottom = `${t}em`;
	}
}
//#endregion
//#region src/overlay.ts
var P = "context-overlay", Pe = "context-note-card", Fe = "context-note-shape";
function F(e) {
	if (!e) return null;
	try {
		let t = JSON.parse(e);
		return typeof t != "object" || !t || ![
			t.x1,
			t.y1,
			t.x2,
			t.y2
		].every((e) => typeof e == "number" && Number.isFinite(e)) ? null : {
			x1: Number(t.x1),
			y1: Number(t.y1),
			x2: Number(t.x2),
			y2: Number(t.y2)
		};
	} catch {
		return null;
	}
}
function Ie(e) {
	return JSON.stringify(e);
}
function I(e, t) {
	for (let n of Array.from(e.querySelectorAll(t))) n.remove();
}
function Le(e, t) {
	let n = O(t.anchor);
	if (!n || n.kind !== "point") return !1;
	let r = e.ownerDocument.createElement("div");
	return r.className = `${P} ${Pe}`, r.dataset.noteId = t.id, r.dataset.color = t.color ?? "yellow", r.style.left = `${(n.x ?? 0) * 100}%`, r.style.top = `${(n.y ?? 0) * 100}%`, r.textContent = t.text ?? "", e.appendChild(r), !0;
}
function Re(e, t) {
	let n = O(t.anchor), r = F(t.geometry);
	if (!n || n.kind !== "point" || !r) return !1;
	let i = e.ownerDocument, a = i.createElementNS("http://www.w3.org/2000/svg", "svg");
	a.setAttribute("class", `${P} ${Fe}`);
	let o = ze(r, e), s = (e) => (e - o.left) / o.width, c = (e) => (e - o.top) / o.height;
	a.setAttribute("viewBox", "0 0 1 1"), a.setAttribute("preserveAspectRatio", "none"), a.style.left = `${L(o.left * 100)}%`, a.style.top = `${L(o.top * 100)}%`, a.style.width = `${L(o.width * 100)}%`, a.style.height = `${L(o.height * 100)}%`, a.dataset.noteId = t.id, a.dataset.color = t.color, a.dataset.shape = t.shape ?? "line";
	let l = {
		x1: s(r.x1),
		y1: c(r.y1),
		x2: s(r.x2),
		y2: c(r.y2)
	}, u = Be(i, t.shape ?? "line", l);
	a.appendChild(u);
	let d = Ve(i, t.shape ?? "line", l);
	return a.appendChild(d), e.appendChild(a), !0;
}
function L(e) {
	return Math.round(e * 1e6) / 1e6;
}
function ze(e, t) {
	let n = t.getBoundingClientRect(), r = n.width > 0 ? 24 / n.width : 5e-4, i = n.height > 0 ? 24 / n.height : 5e-4, { x1: a, y1: o, x2: s, y2: c } = e, l = Math.max(Math.abs(s - a), r), u = Math.max(Math.abs(c - o), i);
	return {
		left: Math.min(a, s) - (l - Math.abs(s - a)) / 2,
		top: Math.min(o, c) - (u - Math.abs(c - o)) / 2,
		width: l,
		height: u
	};
}
function Be(e, t, n) {
	let { x1: r, y1: i, x2: a, y2: o } = n;
	if (t === "rectangle") {
		let t = e.createElementNS("http://www.w3.org/2000/svg", "rect");
		return t.setAttribute("x", String(L(Math.min(r, a)))), t.setAttribute("y", String(L(Math.min(i, o)))), t.setAttribute("width", String(L(Math.abs(a - r)))), t.setAttribute("height", String(L(Math.abs(o - i)))), t;
	}
	if (t === "ellipse") {
		let t = e.createElementNS("http://www.w3.org/2000/svg", "ellipse");
		return t.setAttribute("cx", String(L((r + a) / 2))), t.setAttribute("cy", String(L((i + o) / 2))), t.setAttribute("rx", String(L(Math.abs(a - r) / 2))), t.setAttribute("ry", String(L(Math.abs(o - i) / 2))), t;
	}
	let s = e.createElementNS("http://www.w3.org/2000/svg", "line");
	return s.setAttribute("x1", String(L(r))), s.setAttribute("y1", String(L(i))), s.setAttribute("x2", String(L(a))), s.setAttribute("y2", String(L(o))), s;
}
function Ve(e, t, n) {
	let { x1: r, y1: i, x2: a, y2: o } = n, s;
	if (t === "rectangle") {
		let e = L(Math.min(r, a));
		s = `M${e} ${L(Math.min(i, o))}H${L(Math.max(r, a))}V${L(Math.max(i, o))}H${e}Z`;
	} else if (t === "ellipse") {
		let e = L((r + a) / 2), t = L((i + o) / 2), n = L(Math.abs(a - r) / 2), c = L(Math.abs(o - i) / 2);
		s = `M${L(e - n)} ${t}A${n} ${c} 0 1 0 ${L(e + n)} ${t}A${n} ${c} 0 1 0 ${L(e - n)} ${t}Z`;
	} else s = `M${L(r)} ${L(i)}L${L(a)} ${L(o)}`;
	let c = e.createElementNS("http://www.w3.org/2000/svg", "path");
	return c.setAttribute("d", s), c;
}
//#endregion
//#region src/geometry.ts
function R(e) {
	return Math.max(0, Math.min(1, e));
}
function z(e, t, n) {
	let r = e.getBoundingClientRect(), i = r.width > 0 ? (t - r.left) / r.width : 0, a = r.height > 0 ? (n - r.top) / r.height : 0;
	return {
		x: R(i),
		y: R(a)
	};
}
function He(e, t, n) {
	return (e?.elementFromPoint(t, n))?.closest?.(".context-chapter") ?? null;
}
function Ue(e, t, n) {
	let r = e.ownerDocument;
	if (!r || !e.contains(t)) return null;
	let i = r.createRange();
	return i.setStart(e, 0), i.setEnd(t, n), i.toString().length;
}
function B(e, t, n) {
	if (!t) return null;
	let r = Array.from(t.getClientRects()), i = n === "start" ? r[0] : r[r.length - 1] ?? r[0], a = e.getBoundingClientRect();
	return i ? {
		x: i.left - a.left,
		y: i.top - a.top,
		width: i.width,
		height: i.height
	} : null;
}
//#endregion
//#region src/zoom-anchor.ts
function V(e) {
	let t = e ? Ke(e) : null;
	return {
		range: t,
		top: t ? t.getBoundingClientRect().top : 0
	};
}
function We(e, t) {
	let n = e?.scrollingElement ?? e?.documentElement, r = t.range;
	if (!e || !n || !r) return;
	try {
		if (!e.body?.contains(r.startContainer)) return;
	} catch {
		return;
	}
	let i = r.getBoundingClientRect().top - t.top;
	i && (n.scrollTop += i);
}
function Ge(e, t) {
	let n = e?.defaultView, r = e?.scrollingElement ?? e?.documentElement;
	if (!e || !n || !r) return;
	let i = Ke(e), a = i ? i.getBoundingClientRect().top : 0;
	e.documentElement.style.fontSize = `${t}%`;
	let o = (i ? i.getBoundingClientRect().top : 0) - a;
	o && (r.scrollTop += o);
}
function Ke(e) {
	let t = e.defaultView;
	if (!t) return null;
	let n = Math.round(t.innerWidth / 2), r = e.body ?? e.documentElement, i = r && parseFloat(t.getComputedStyle(r).lineHeight) || 24, a = Math.round(18 + i), o = e.caretRangeFromPoint;
	if (typeof o == "function") {
		let t = o.call(e, n, a);
		if (t) return t;
	}
	let s = e.caretPositionFromPoint;
	if (typeof s == "function") {
		let t = s.call(e, n, a);
		if (t) {
			let n = e.createRange();
			return n.setStart(t.offsetNode, t.offset), n.setEnd(t.offsetNode, t.offset), n;
		}
	}
	return null;
}
//#endregion
//#region src/selection.ts
function qe(e) {
	let t = (e ?? []).filter((e) => e.width > 0 && e.height > 0).sort((e, t) => e.y + e.height / 2 - (t.y + t.height / 2) || e.x - t.x), n = [];
	for (let e of t) {
		let t = n[n.length - 1];
		if (t && Math.min(t.bottom, e.y + e.height) - Math.max(t.top, e.y) > Math.min(t.bottom - t.top, e.height) * .5) {
			t.top = Math.min(t.top, e.y), t.bottom = Math.max(t.bottom, e.y + e.height), t.x = Math.min(t.x, e.x), t.right = Math.max(t.right, e.x + e.width);
			continue;
		}
		n.push({
			top: e.y,
			bottom: e.y + e.height,
			x: e.x,
			right: e.x + e.width
		});
	}
	let r = [];
	for (let e of n) {
		let t = e.top;
		if (r.length > 0) {
			let e = r[r.length - 1], n = e.y + e.height;
			t < n && (t = n);
		}
		e.bottom > t && r.push({
			x: e.x,
			y: t,
			width: e.right - e.x,
			height: e.bottom - t
		});
	}
	return r;
}
function Je(e) {
	let t = e?.lineHeight;
	if (!t || t === "normal") return null;
	let n = Number.parseFloat(t);
	return Number.isFinite(n) && n > 0 ? n : null;
}
function Ye(e, t, n, r) {
	let i = [], a = t.commonAncestorContainer, o = a.nodeType === 3 ? a.parentNode : a;
	if (!o) return i;
	let s = e.defaultView, c = e.createTreeWalker(o, (s ? s.NodeFilter : NodeFilter).SHOW_TEXT), l = c.nextNode();
	for (; l;) {
		if (t.intersectsNode(l)) {
			let a = l, o = a === t.startContainer ? t.startOffset : 0, c = a === t.endContainer ? t.endOffset : a.length;
			if (c > o) {
				let t = e.createRange();
				t.setStart(a, o), t.setEnd(a, c);
				let l = s && a.parentElement ? Je(s.getComputedStyle(a.parentElement)) : null;
				for (let e of Array.from(t.getClientRects())) {
					if (e.width <= 0 || e.height <= 0) continue;
					let t = e.height, a = e.top + r, o = l !== null && l > t;
					i.push({
						x: e.left + n,
						y: o ? a + t / 2 - l / 2 : a,
						width: e.width,
						height: o ? l : t
					});
				}
			}
		}
		l = c.nextNode();
	}
	return i;
}
function Xe(e) {
	for (let t of Array.from(e?.querySelectorAll(".context-selection-layer") ?? [])) t.remove();
}
function H(e, t) {
	if (Xe(e), !e || !t) return;
	let n = e.scrollingElement ?? e.documentElement, r = qe(Ye(e, t, n?.scrollLeft ?? 0, n?.scrollTop ?? 0));
	if (r.length === 0) return;
	let i = e.createElement("div");
	i.className = T, i.style.position = "absolute", i.style.left = "0", i.style.top = "0", r.forEach((t, n) => {
		let a = e.createElement("div");
		a.className = E, a.style.left = `${t.x}px`, a.style.top = `${t.y}px`, a.style.width = `${t.width}px`, a.style.height = `${t.height}px`;
		let o = n === 0, s = n === r.length - 1;
		a.dataset.edge = o && s ? "both" : o ? "start" : s ? "end" : "none", i.append(a);
	}), e.documentElement.append(i);
}
var Ze = 60, Qe = /* @__PURE__ */ new WeakMap();
function $e(e) {
	let t = "", n = [], r = !1;
	for (let i = 0; i < e.length; i += 1) {
		let a = e[i];
		if (/\s/.test(a)) {
			r = t.length > 0;
			continue;
		}
		r &&= (t += " ", n.push(i), !1);
		let o = a.toLowerCase();
		for (let e = 0; e < o.length; e += 1) t += o[e], n.push(i);
	}
	return {
		text: t,
		offsets: n
	};
}
function et(e, t) {
	let n = Qe.get(e);
	if (n && n.raw === t) return n;
	let r = {
		raw: t,
		...$e(t)
	};
	return Qe.set(e, r), r;
}
function tt(e) {
	return $e(e).text;
}
function nt(e, t, n) {
	let r = Math.max(0, t - Ze), i = Math.min(e.length, n + Ze), a = e.slice(r, i).replace(/\s+/g, " ").trim();
	return `${r > 0 ? "…" : ""}${a}${i < e.length ? "…" : ""}`;
}
function rt(e, t) {
	let n = [];
	if (!t) return n;
	let r = 0;
	for (;;) {
		let i = e.indexOf(t, r);
		if (i < 0) return n;
		n.push(i), r = i + Math.max(1, t.length);
	}
}
function it(e, t, n, r, i) {
	let a = [];
	if (!n || i <= 0) return {
		hits: a,
		truncated: !1
	};
	let { text: o, offsets: s } = e, c = !1;
	for (let e of rt(o, n)) {
		if (a.length >= i) {
			c = !0;
			break;
		}
		let o = s[e] ?? 0, l = (s[Math.min(e + n.length - 1, s.length - 1)] ?? o) + 1;
		a.push({
			chapter: r,
			start: o,
			end: l,
			preview: nt(t, o, l)
		});
	}
	return {
		hits: a,
		truncated: c
	};
}
function at(e, t, n, r = 500) {
	let i = tt(t), a = [], o = !1;
	if (!i) return {
		hits: a,
		truncated: o
	};
	for (let t of e) {
		if (a.length >= r) {
			o = !0;
			break;
		}
		let e = n(t);
		if (!e) continue;
		let s = Number(t.dataset.chapter ?? "0"), c = it(et(t, e), e, i, Number.isFinite(s) ? s : 0, r - a.length);
		a.push(...c.hits), o ||= c.truncated;
	}
	return {
		hits: a,
		truncated: o
	};
}
//#endregion
//#region src/protocol.ts
var ot = "context-workplace";
function U(e) {
	parent.postMessage({
		channel: ot,
		...e
	}, "*");
}
function st(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	if (t.channel !== "context-workplace" || typeof t.type != "string") return null;
	let n = e;
	switch (t.type) {
		case "open": return {
			type: "open",
			data: String(n.data ?? ""),
			title: String(n.title ?? ""),
			position: Number(n.position) || 0,
			zoom: Number(n.zoom) || 100
		};
		case "zoom": return {
			type: "zoom",
			value: Number(n.value) || 100
		};
		case "goto": {
			let e = n.value ?? {};
			return {
				type: "goto",
				value: {
					noteId: typeof e.noteId == "string" ? e.noteId : void 0,
					anchor: typeof e.anchor == "string" ? e.anchor : void 0,
					page: typeof e.page == "number" ? e.page : void 0,
					chapter: typeof e.chapter == "number" ? e.chapter : void 0
				}
			};
		}
		case "note-menu-action": {
			let e = n.value ?? {};
			return {
				type: "note-menu-action",
				value: {
					noteId: String(e.noteId ?? ""),
					action: String(e.action ?? "")
				}
			};
		}
		case "notes": return {
			type: "notes",
			value: Array.isArray(n.value) ? n.value : []
		};
		case "tool": {
			let e = n.value ?? {};
			return {
				type: "tool",
				value: {
					type: String(e.type ?? "quote"),
					shape: String(e.shape ?? "line"),
					color: String(e.color ?? "yellow")
				}
			};
		}
		case "reader-theme": return {
			type: "reader-theme",
			value: n.value ?? {}
		};
		case "reader-locale": return {
			type: "reader-locale",
			value: String(n.value ?? "ru")
		};
		case "show": return { type: "show" };
		case "clear-selection": return { type: "clear-selection" };
		case "footnote-close": return { type: "footnote-close" };
		case "search": {
			let e = n.value ?? {};
			return {
				type: "search",
				value: { query: String(e.query ?? "") }
			};
		}
		case "search-step": {
			let e = n.value ?? {};
			return {
				type: "search-step",
				value: { delta: Number(e.delta) || 1 }
			};
		}
		case "hotkey-bindings": return {
			type: "hotkey-bindings",
			value: Array.isArray(n.value) ? n.value : []
		};
		case "command": {
			let e = n.value ?? {};
			return {
				type: "command",
				value: { id: String(e.id ?? "") }
			};
		}
		default: return null;
	}
}
function ct(e) {
	let t = atob(String(e || "")), n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e += 1) n[e] = t.charCodeAt(e);
	return n;
}
function lt(e) {
	return new TextDecoder("utf-8").decode(ct(e));
}
//#endregion
//#region src/main.ts
var W = {
	chapters: [],
	notes: [],
	tool: {
		type: "quote",
		shape: "line",
		color: "yellow"
	},
	zoom: 100,
	progress: 0,
	hits: [],
	activeHit: null,
	query: "",
	bindings: [],
	opened: !1,
	title: "",
	theme: null
};
function G() {
	return e.ownerDocument;
}
function K(t) {
	return e.querySelector(`.${x}[data-chapter="${t}"]`);
}
function q() {
	return Array.from(e.querySelectorAll(`.${x}`));
}
function ut(e) {
	if (e.kind !== "text") return null;
	let t = K(e.chapter);
	if (t) {
		let n = j(t, e);
		if (n) return {
			section: t,
			range: n.range,
			start: n.start,
			end: n.end
		};
	}
	for (let n of q()) {
		if (n === t) continue;
		let r = j(n, e);
		if (r) return {
			section: n,
			range: r.range,
			start: r.start,
			end: r.end
		};
	}
	return null;
}
function dt() {
	let e = G().body;
	e.dataset.tool = W.tool.type;
}
function ft(e, t) {
	let n = t ?? O(e.anchor ?? "");
	if (!n || e.type !== "quote") return;
	let r = ut(n);
	r && Me(r.section, r.start, r.end, S, e.id, e.color ?? "yellow");
}
function pt(e, t, n) {
	let r = t ?? O(e.anchor ?? "");
	if (!r) return;
	let i = K(r.chapter);
	if (!i) return;
	let a = {
		...e,
		anchor: JSON.stringify(r)
	};
	e.type === "text" ? Le(i, a) : e.type === "shape" && Re(i, {
		...a,
		geometry: n ?? e.geometry
	});
}
function mt(e) {
	let t = G();
	N(t, `mark.${S}[data-note-id="${e}"]`), I(t, `.${P}[data-note-id="${e}"]`);
}
function J() {
	let e = G();
	N(e, `mark.${S}`), I(e, `.${P}`);
	for (let e of W.notes) e.type === "quote" || e.type === void 0 ? ft(e) : pt(e);
}
function ht(e) {
	let t = new Map(W.notes.map((e) => [e.id, e]));
	for (let n of e) t.has(n.id) || mt(n.id);
	for (let t of W.notes) {
		let n = e.find((e) => e.id === t.id);
		(n === void 0 || n.type !== t.type || n.anchor !== t.anchor || n.color !== t.color) && (mt(t.id), t.type === "quote" || t.type === void 0 ? ft(t) : pt(t));
	}
}
function Y(e, t) {
	let r = n(), i = r.clientHeight, a = Math.max(0, e - t);
	if (a >= r.scrollTop && a <= r.scrollTop + i - t) return;
	let o = Math.abs(a - r.scrollTop);
	r.scrollTo({
		top: a,
		behavior: o > i * 1.5 ? "auto" : "smooth"
	});
}
function gt(e) {
	let t = n(), r = t.scrollHeight - t.clientHeight;
	r > 0 && t.scrollTo({ top: Math.max(0, Math.min(100, e)) / 100 * r });
}
function _t(e) {
	let t = O(e.anchor ?? ""), r = t ? ut(t) : null, i = r?.section ?? (t ? K(t.chapter) : null);
	t?.kind === "point" && i ? Y(i.getBoundingClientRect().top + n().scrollTop, 120) : r ? Y(r.range.getBoundingClientRect().top + n().scrollTop, 80) : t && t.percent > 0 && gt(t.percent);
	for (let t of Array.from(G().querySelectorAll(`mark.${S}[data-note-id="${e.id}"]`))) t.classList.add(C), setTimeout(() => t.classList.remove(C), 300);
	for (let t of Array.from(G().querySelectorAll(`.${P}[data-note-id="${e.id}"]`))) t.classList.add(C), setTimeout(() => t.classList.remove(C), 300);
}
function vt(e) {
	let t = K(e);
	t && (Y(t.getBoundingClientRect().top + n().scrollTop, 80), X());
}
function yt() {
	y(G());
	let e = W.activeHit === null ? null : W.hits[W.activeHit];
	for (let t of q()) {
		let n = Number(t.dataset.chapter ?? "0"), r = W.hits.filter((e) => e.chapter === n);
		r.length !== 0 && ve(t, r, e && e.chapter === n ? e.start : null);
	}
}
function bt(e) {
	if (W.query = e.trim(), !W.query) {
		W.hits = [], W.activeHit = null, y(G()), U({
			type: "search",
			value: {
				query: "",
				total: 0,
				index: null
			}
		});
		return;
	}
	let t = at(q(), W.query, Ae);
	W.hits = t.hits, W.activeHit = t.hits.length > 0 ? 0 : null, yt(), U({
		type: "search",
		value: {
			query: W.query,
			total: t.hits.length,
			index: W.activeHit,
			truncated: t.truncated
		}
	});
}
function xt(e) {
	if (W.hits.length === 0) return;
	let t = W.activeHit === null ? 0 : (W.activeHit + e + W.hits.length) % W.hits.length;
	W.activeHit = t;
	let r = G();
	for (let e of Array.from(r.querySelectorAll(`mark.${_}`))) e.classList.remove(v);
	let i = W.hits[t], a = K(i.chapter);
	if (a) {
		for (let e of Array.from(a.querySelectorAll(`mark.${_}`))) e.dataset.start === String(i.start) && e.classList.add(v);
		let e = a.querySelector(`mark.${v}`);
		e && Y(e.getBoundingClientRect().top + n().scrollTop, 120);
	}
	U({
		type: "search",
		value: {
			query: W.query,
			total: W.hits.length,
			index: t,
			truncated: !1
		}
	});
}
function X() {
	W.progress = r(), U({
		type: "progress",
		value: W.progress
	});
}
function St(n, r) {
	W.chapters = n;
	let i = G(), a = i.getElementById("context-book-style");
	a || (a = i.createElement("style"), a.id = "context-book-style", i.head.appendChild(a)), a.textContent = xe(), e.innerHTML = n.map((e, t) => `<section class="${x}" data-chapter="${t}">${e.html}</section>`).join("\n"), W.theme && Ce(G().documentElement, W.theme), W.opened = !0, t.hidden = !0, dt(), J(), r > 0 && gt(r), he(G()), X(), U({
		type: "state",
		value: {
			page: null,
			pages: null
		}
	}), U({
		type: "contents",
		value: n.map((e, t) => ({
			index: t,
			title: e.title ?? `Глава ${t + 1}`
		}))
	}), U({
		type: "capabilities",
		value: {
			zoom: !0,
			pages: !1,
			selection: !0,
			flowing: !0
		}
	});
}
function Ct(e) {
	W.tool = e, dt();
}
function wt(e) {
	let t = st(e.data);
	if (t) switch (t.type) {
		case "open": {
			let e = JSON.parse(lt(t.data));
			W.title = String(e.title ?? ""), W.zoom = t.zoom, Ge(G(), t.zoom), St(e.chapters ?? [], t.position);
			break;
		}
		case "zoom":
			W.zoom = t.value, Ge(G(), t.value), Xe(G());
			break;
		case "goto": {
			let e = t.value;
			if (e.noteId) {
				let t = W.notes.find((t) => t.id === e.noteId);
				t && _t(t);
			} else typeof e.chapter == "number" ? vt(e.chapter) : typeof e.page == "number" ? vt(e.page) : e.anchor && _t({
				id: "",
				type: "quote",
				anchor: e.anchor,
				quote: "",
				color: "yellow"
			});
			break;
		}
		case "note-menu-action":
			Pt(t.value.noteId, t.value.action);
			break;
		case "notes": {
			let e = W.notes;
			W.notes = t.value, e.length === 0 ? J() : ht(e);
			break;
		}
		case "tool":
			Ct(t.value);
			break;
		case "reader-theme":
			W.theme = t.value, Ce(G().documentElement, t.value), J();
			break;
		case "reader-locale":
			o(t.value);
			break;
		case "show":
			X();
			break;
		case "footnote-close":
			Z = null;
			break;
		case "clear-selection": {
			let e = G();
			e.getSelection()?.removeAllRanges(), H(e, null);
			break;
		}
		case "search":
			bt(t.value.query);
			break;
		case "search-step":
			xt(t.value.delta < 0 ? -1 : 1);
			break;
		case "hotkey-bindings":
			W.bindings = t.value;
			break;
		case "command": Tt(t.value.id);
	}
}
function Tt(e) {
	switch (e) {
		case "reader.screen.next":
			n().scrollTop += n().clientHeight, X();
			break;
		case "reader.screen.prev":
			n().scrollTop = Math.max(0, n().scrollTop - n().clientHeight), X();
			break;
		case "reader.book.start":
			n().scrollTop = 0, X();
			break;
		case "reader.book.end": n().scrollTop = n().scrollHeight, X();
	}
}
function Et(e) {
	if (e.defaultPrevented || e.isComposing) return;
	let t = e.target;
	if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
	let n = W.bindings.find((t) => (t.code ?? "") === e.code && !!t.ctrl === e.ctrlKey && !!t.alt === e.altKey && !!t.shift === e.shiftKey && !!t.meta === e.metaKey);
	n && (e.preventDefault(), U({
		type: "hotkey",
		value: { id: n.id }
	}));
}
function Dt() {
	let e = G(), t = e.getSelection();
	if (H(e, t && !t.isCollapsed && t.rangeCount > 0 ? t.getRangeAt(0) : null), !t || t.isCollapsed || t.rangeCount === 0) {
		U({ type: "selection-cleared" });
		return;
	}
	let r = t.getRangeAt(0), i = (e) => e ? e.nodeType === Node.ELEMENT_NODE ? e : e.parentElement : null, a = i(r.startContainer)?.closest(`.${x}`), o = i(r.endContainer)?.closest(`.${x}`);
	if (!a || a !== o) {
		U({ type: "selection-cleared" });
		return;
	}
	let s = Ee(a, r), c = r.toString().replace(/\s+/g, " ").trim();
	if (!s || !c) {
		U({ type: "selection-cleared" });
		return;
	}
	let l = r.getBoundingClientRect(), u = n().scrollHeight, d = u > 0 ? Math.max(0, Math.min(100, (l.top + n().scrollTop) / u * 100)) : 0, f = Number(a.dataset.chapter ?? "0"), ee = D({
		chapter: Number.isFinite(f) ? f : 0,
		start: s.start,
		end: s.end,
		quote: c,
		percent: d,
		page: null
	}), p = r.getClientRects(), m = p.length > 0 ? p[p.length - 1] : l;
	U({
		type: "selection",
		value: {
			anchor: ee,
			x: Math.max(8, Math.min(m.right, window.innerWidth - 180)),
			y: Math.max(8, m.bottom + 6)
		}
	});
}
function Ot(e) {
	let t = n().scrollHeight;
	return t > 0 ? Math.max(0, Math.min(100, (e + n().scrollTop) / t * 100)) : 0;
}
var Z = null;
function kt(e) {
	let t = e.target, r = t?.closest?.("a[href]");
	if (r) {
		e.preventDefault();
		let t = G();
		if (r.classList.contains("context-footnote-back")) {
			let e = l(t, (r.getAttribute("href") ?? "").replace(/^#/, ""));
			e && (Y(e.getBoundingClientRect().top + n().scrollTop, 120), e.classList.add(w), setTimeout(() => e.classList.remove(w), 600));
			return;
		}
		let i = c(r.getAttribute("href"));
		if (i.kind === "anchor" && i.anchor) {
			let e = se(r, t);
			if (e) {
				if (Z === r) {
					Z = null, U({ type: "footnote-close" });
					return;
				}
				Z = r;
				let t = r.getBoundingClientRect();
				U({
					type: "footnote",
					value: {
						html: de(e.target),
						anchor: e.anchor,
						left: t.left,
						top: t.top,
						bottom: t.bottom
					}
				});
				return;
			}
			let a = l(t, i.anchor);
			a && Y(a.getBoundingClientRect().top + n().scrollTop, 120);
			return;
		}
		i.kind === "external" && U({
			type: "open-link",
			value: { href: i.href }
		});
		return;
	}
	let i = t?.closest?.(`mark.${S}, .${P}`), a = i?.dataset.noteId;
	if (a && i) {
		let e = (i.querySelector("line,rect,ellipse") ?? i).getBoundingClientRect();
		U({
			type: "note-click",
			value: { noteId: a }
		}), U({
			type: "note-menu",
			value: {
				noteId: a,
				noteType: W.notes.find((e) => e.id === a)?.type ?? "quote",
				left: e.left,
				top: e.bottom,
				bottom: e.bottom
			}
		});
	}
}
function At(e) {
	let t = e.target?.closest?.("[data-note-handle]");
	if (!$ || !t) return !1;
	e.preventDefault();
	let n = t.getAttribute("data-note-handle") === "start" ? "start" : "end", r = G(), i = (e) => {
		let t = $;
		if (!t) return;
		let r = K(t.anchor.chapter);
		if (!r) return;
		let i = Ft(r, e.clientX, e.clientY);
		if (i === null) return;
		let a = t.anchor.start, o = t.anchor.end;
		n === "start" ? a = Math.max(0, Math.min(i, o - 1)) : o = Math.max(a + 1, i);
		let s = M(r, a, o), c = s ? s.toString().replace(/\s+/g, " ").trim() : t.anchor.quote;
		$ = {
			...t,
			anchor: D({
				...t.anchor,
				start: a,
				end: o,
				quote: c
			})
		}, Nt();
	}, a = () => {
		r.removeEventListener("mousemove", i), r.removeEventListener("mouseup", a), removeEventListener("mousemove", i), removeEventListener("mouseup", a), It();
	};
	return r.addEventListener("mousemove", i), r.addEventListener("mouseup", a), addEventListener("mousemove", i), addEventListener("mouseup", a), !0;
}
function jt(e) {
	if (At(e) || W.tool.type !== "text" && W.tool.type !== "shape" || e.target?.closest?.("mark.context-note, .context-overlay")) return;
	let t = He(G(), e.clientX, e.clientY);
	if (!t) return;
	let n = z(t, e.clientX, e.clientY), r = Number(t.dataset.chapter ?? "0"), i = D({
		kind: "point",
		chapter: Number.isFinite(r) ? r : 0,
		x: n.x,
		y: n.y,
		percent: Ot(e.clientY)
	});
	if (W.tool.type === "text") {
		U({
			type: "text-point",
			value: {
				anchor: i,
				color: W.tool.color
			}
		});
		return;
	}
	let a = n, o = n, s = (e) => {
		o = z(t, e.clientX, e.clientY);
	}, c = () => {
		window.removeEventListener("mousemove", s), window.removeEventListener("mouseup", c), (Math.abs(o.x - a.x) > .005 || Math.abs(o.y - a.y) > .005) && U({
			type: "shape",
			value: {
				anchor: i,
				shape: W.tool.shape,
				geometry: Ie({
					x1: a.x,
					y1: a.y,
					x2: o.x,
					y2: o.y
				}),
				color: W.tool.color
			}
		});
	};
	window.addEventListener("mousemove", s), window.addEventListener("mouseup", c);
}
var Q = V(G()), $ = null;
function Mt() {
	for (let e of Array.from(G().querySelectorAll(".context-note-handle"))) e.remove();
}
function Nt() {
	Mt();
	let e = $, t = e?.anchor, n = t ? K(t.chapter) : null;
	if (!e || !t || !n) return;
	let r = M(n, Math.max(0, t.start), Math.max(0, t.start + 1)), i = M(n, Math.max(0, t.end - 1), Math.max(0, t.end)), a = B(n, r, "start"), o = B(n, i, "end");
	if (!a || !o) return;
	let s = G();
	for (let [e, t] of [["start", a], ["end", o]]) {
		let r = s.createElement("div");
		r.className = "context-note-handle", r.dataset.noteHandle = e;
		let i = n.getBoundingClientRect();
		r.style.left = `${t.x + (e === "start" ? i.left : i.left + t.width)}px`, r.style.top = `${t.y + i.top + t.height / 2}px`, s.body.appendChild(r);
	}
}
function Pt(e, t) {
	let n = W.notes.find((t) => t.id === e), r = n ? O(n.anchor ?? "") : null;
	n && r && t === "resize" && ($ = {
		noteId: e,
		anchor: r,
		marker: null
	}, Nt());
}
function Ft(e, t, n) {
	let r = G(), i = r.caretRangeFromPoint;
	if (typeof i != "function") return null;
	let a = i.call(r, t, n);
	return !a || ((e) => e.nodeType === Node.ELEMENT_NODE ? e : e.parentElement)(a.startContainer)?.closest(".context-chapter") !== e ? null : Ue(e, a.startContainer, a.startOffset);
}
function It() {
	let e = $;
	$ = null, Mt(), e && U({
		type: "place-note",
		value: {
			noteId: e.noteId,
			anchor: e.anchor
		}
	});
}
function Lt() {
	t.textContent = s("opening"), addEventListener("scroll", () => {
		X(), Q = V(G());
	}, { passive: !0 }), document.addEventListener("mouseup", Dt), document.addEventListener("mousedown", jt), document.addEventListener("selectionchange", () => {
		let e = G().getSelection(), t = e && !e.isCollapsed && e.rangeCount > 0 ? e.getRangeAt(0) : null;
		H(G(), t), t || U({ type: "selection-cleared" });
	}), e.addEventListener("click", kt), addEventListener("keydown", Et), addEventListener("resize", () => {
		We(G(), Q), Q = V(G()), X();
	}), addEventListener("message", wt), document.body.dataset.tool = W.tool.type, U({
		type: "capabilities",
		value: {
			zoom: !0,
			pages: !1,
			selection: !0,
			flowing: !0
		}
	}), U({ type: "ready" });
}
Lt();
//#endregion
export { Ae as chapterTextOf, Ue as charOffset, R as clamp01, F as parseGeometry, M as rangeFromOffsets, B as rangeHandleRect };
