const DIMENSIONS = [
  { key: "visual_accuracy", label: "视觉事实准确性" },
  { key: "analysis_depth", label: "艺术分析深度" },
  { key: "cultural_fit", label: "文化寓意契合" },
  { key: "writing_quality", label: "文本表达质量" }
];

const RUBRICS = [
  { title: "视觉事实准确性", levels: ["多处关键视觉事实错误或与原图明显矛盾。", "存在明显误读；重要物象、位置或技法描述不可靠。", "主要描述大体正确，但有可见错误或多处未经支持的判断。", "描述基本符合原图，仅有轻微不准确或不确定之处。", "关键视觉陈述均与原图相符，具体且无明显编造。"] },
  { title: "艺术分析深度", levels: ["几乎只有空泛评价或复述题材，没有具体分析。", "列举少量画面特征，但未说明其技法效果或审美意义。", "有具体观察和初步解释，但联系较浅或不够连贯。", "能从构图、笔墨、设色等具体特征推导出清楚的艺术效果。", "观察具体准确，技法与形式分析深入，并形成连贯、有洞见的审美阐释。"] },
  { title: "文化寓意契合", levels: ["未表达参考寓意，或表达方向明显错误。", "仅使用泛化吉祥话，或只提及物象而未说明其寓意。", "表达了部分正确含义，但核心内容缺失或较含混。", "基本准确表达核心寓意，但内容略有遗漏或解释不充分。", "准确表达核心寓意，并能把寓意与画面物象联系起来；语义相近的中文表达可得高分。"] },
  { title: "文本表达质量", levels: ["难以理解，结构混乱或严重重复。", "表达不够清楚，衔接生硬，重复或套话较多。", "整体可读，但存在明显冗余、跳跃或措辞不当。", "清晰连贯，结构合理，语言基本准确。", "行文自然、凝练而有条理，表达准确，阅读体验好。"] }
];

const $ = (selector) => document.querySelector(selector);
const state = { dataset: null, currentImage: 0, reviewer: "", answers: {}, cardOrder: {} };
let toastTimer;

function storageKey() { return `art-review-v1:${state.reviewer.trim()}`; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function stableHash(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function shuffleForReviewer(cards, imageId) {
  const sorted = [...cards];
  let seed = stableHash(`${state.reviewer}:${imageId}`) || 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted;
}
function save() {
  if (!state.reviewer.trim()) return;
  localStorage.setItem(storageKey(), JSON.stringify({ answers: state.answers, currentImage: state.currentImage }));
  const label = $("#save-state");
  label.textContent = "已保存";
  label.classList.add("saved");
  updateProgress();
}
function loadReviewer() {
  state.reviewer = $("#reviewer-id").value.trim();
  state.answers = {};
  if (state.reviewer) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      state.answers = saved.answers || {};
      state.currentImage = Math.min(saved.currentImage || 0, state.dataset.images.length - 1);
      $("#save-state").textContent = "已载入";
      $("#save-state").classList.add("saved");
    } catch { state.answers = {}; }
  }
  $("#export-button").disabled = !state.reviewer;
  renderImagePicker();
  render();
  updateProgress();
}
function answerFor(itemId) {
  return state.answers[itemId] || { scores: {}, comment: "" };
}
function complete(itemId) {
  return DIMENSIONS.every(({ key }) => [1, 2, 3, 4, 5].includes(Number(answerFor(itemId).scores[key])));
}
function updateProgress() {
  if (!state.dataset) return;
  const cards = state.dataset.images.flatMap((image) => image.cards);
  const done = cards.filter((card) => complete(card.id)).length;
  const percent = Math.round((done / cards.length) * 100);
  $("#progress-count").textContent = `${done} / ${cards.length}`;
  $("#progress-bar").style.width = `${percent}%`;
  $("#percent-progress").textContent = `${percent}%`;
  $("#image-progress").textContent = `图片 ${state.currentImage + 1} / ${state.dataset.images.length}`;
  const image = state.dataset.images[state.currentImage];
  const imageDone = image.cards.filter((card) => complete(card.id)).length;
  $("#image-completion").textContent = `本图 ${imageDone} / ${image.cards.length}`;
}
function renderImagePicker() {
  const picker = $("#image-picker");
  picker.innerHTML = state.dataset.images.map((image, index) => `<option value="${index}">${String(index + 1).padStart(2, "0")} · ${escapeHtml(image.image_id)}</option>`).join("");
  picker.value = String(state.currentImage);
}
function render() {
  if (!state.dataset) return;
  const image = state.dataset.images[state.currentImage];
  $("#loading").hidden = true;
  $("#review-content").hidden = false;
  $("#image-error").hidden = true;
  $("#artwork").onerror = () => { $("#image-error").hidden = false; };
  $("#artwork").onload = () => { $("#image-error").hidden = true; };
  $("#artwork").src = image.image;
  $("#artwork").alt = `作品原图 ${image.image_id}`;
  $("#image-label").textContent = image.image_id;
  $("#concept-count").textContent = `关键事实概念 ${image.key_fact_count}`;
  $("#meaning").textContent = image.theme || "未提供寓意文字";
  $("#motifs").textContent = image.motifs.length ? `标注母题：${image.motifs.join("、")}` : "";
  $("#image-picker").value = String(state.currentImage);
  const orderedCards = shuffleForReviewer(image.cards, image.image_id);
  $("#cards").innerHTML = orderedCards.map((card, index) => renderCard(card, index + 1)).join("");
  attachCardListeners();
  updateProgress();
}
function renderCard(card, number) {
  const answer = answerFor(card.id);
  const isComplete = complete(card.id);
  const groups = DIMENSIONS.map(({ key, label }) => {
    const value = Number(answer.scores[key] || 0);
    const options = [1, 2, 3, 4, 5].map((score) => `<label class="rating-option"><input type="radio" name="${card.id}-${key}" value="${score}" ${value === score ? "checked" : ""} ${state.reviewer ? "" : "disabled"} aria-label="${escapeHtml(label)} ${score}分"><span>${score}</span></label>`).join("");
    return `<div class="rating-group"><span class="rating-label">${escapeHtml(label)}</span><div class="rating-options">${options}</div></div>`;
  }).join("");
  const hasComment = Boolean(answer.comment);
  return `<article class="text-card" data-item-id="${card.id}">
    <div class="card-heading"><span class="card-number">${String(number).padStart(2, "0")}</span><h3>文本 ${String(number).padStart(2, "0")}</h3><span class="card-status ${isComplete ? "complete" : ""}">${isComplete ? "已完成" : "待评分"}</span></div>
    <p class="text-body">${escapeHtml(card.text)}</p>
    ${state.reviewer ? "" : "<p class=\"reviewer-required\">请先输入评审者姓名，再开始评分。</p>"}
    <div class="rating-grid">${groups}</div>
    <button class="comment-toggle" type="button" aria-expanded="${hasComment}">${hasComment ? "收起评语" : "添加评语（选填）"}</button>
    <textarea class="comment-area" aria-label="文本 ${number} 评语" placeholder="可记录具体优点、问题或评分依据" ${hasComment ? "" : "hidden"}>${escapeHtml(answer.comment)}</textarea>
  </article>`;
}
function attachCardListeners() {
  document.querySelectorAll(".text-card").forEach((cardElement) => {
    const itemId = cardElement.dataset.itemId;
    cardElement.querySelectorAll("input[type=radio]").forEach((input) => input.addEventListener("change", () => {
      const [, dimension] = input.name.split("-");
      const answer = answerFor(itemId);
      answer.scores[dimension] = Number(input.value);
      state.answers[itemId] = answer;
      save();
      cardElement.querySelector(".card-status").textContent = complete(itemId) ? "已完成" : "待评分";
      cardElement.querySelector(".card-status").classList.toggle("complete", complete(itemId));
    }));
    const comment = cardElement.querySelector(".comment-area");
    cardElement.querySelector(".comment-toggle").addEventListener("click", (event) => {
      comment.hidden = !comment.hidden;
      event.currentTarget.textContent = comment.hidden ? "添加评语（选填）" : "收起评语";
      event.currentTarget.setAttribute("aria-expanded", String(!comment.hidden));
      if (!comment.hidden) comment.focus();
    });
    comment.addEventListener("input", () => {
      const answer = answerFor(itemId);
      answer.comment = comment.value;
      state.answers[itemId] = answer;
      save();
    });
  });
}
function moveImage(delta) {
  state.currentImage = Math.max(0, Math.min(state.dataset.images.length - 1, state.currentImage + delta));
  save();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function csvEscape(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function safeReviewerName() { return state.reviewer.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/\s+/g, "_"); }
function download(filename, content, type) {
  const blob = new Blob(["\ufeff", content], { type });
  downloadBlob(filename, blob);
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const EXPORT_COLUMNS = ["reviewer_name", "image_id", "item_id", "visual_accuracy", "analysis_depth", "cultural_fit", "writing_quality", "comment"];
function exportRows() {
  const rows = [EXPORT_COLUMNS];
  for (const image of state.dataset.images) for (const card of image.cards) {
    const answer = answerFor(card.id);
    rows.push([state.reviewer, image.image_id, card.id, ...DIMENSIONS.map(({ key }) => answer.scores[key] ?? ""), answer.comment || ""]);
  }
  return rows;
}
function exportCsv() {
  const csv = exportRows().map((row) => row.map(csvEscape).join(",")).join("\r\n");
  download(`review_${safeReviewerName()}_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}
function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function columnName(index) {
  let result = "";
  for (index++; index > 0; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result;
  return result;
}
function sheetCell(value, address) {
  if (typeof value === "number") return `<c r="${address}"><v>${value}</v></c>`;
  if (value === "" || value === null || value === undefined) return "";
  return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}
async function exportXlsx() {
  if (!window.JSZip) { toast("Excel 留档组件没有载入，请刷新页面后重试"); return; }
  const rows = exportRows().map((row, rowIndex) => row.map((value, columnIndex) => {
    if (rowIndex > 0 && columnIndex >= 3 && columnIndex <= 6 && value !== "") return Number(value);
    return value;
  }));
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => sheetCell(value, `${columnName(columnIndex)}${rowIndex + 1}`)).join("")}</row>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder("xl").file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="评分留档" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.folder("xl").folder("worksheets").file("sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
  downloadBlob(`review_${safeReviewerName()}_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
  toast("Excel 留档已下载，可稍后导入继续评分");
}
function openExportDialog() {
  $("#export-dialog").showModal();
}
function exportJson() {
  const data = { version: 1, reviewer_name: state.reviewer, exported_at: new Date().toISOString(), answers: state.answers, current_image: state.currentImage };
  download(`review_backup_${safeReviewerName()}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function renderRubrics() {
  $("#rubric-content").innerHTML = RUBRICS.map((rubric) => `<section class="rubric-section"><h3>${escapeHtml(rubric.title)}</h3><ol>${rubric.levels.map((level) => `<li>${escapeHtml(level)}</li>`).join("")}</ol></section>`).join("");
}
function applyImportedAnswers(reviewer, incomingAnswers, currentImage = 0) {
  if (state.reviewer && state.reviewer !== reviewer) throw new Error(`此留档属于“${reviewer}”，当前姓名为“${state.reviewer}”。请先切换到对应评审者姓名。`);
  if (state.reviewer && !window.confirm("将从留档恢复评分；文件中已填写的分数和评语会覆盖浏览器内对应项目。是否继续？")) return;
  state.reviewer = reviewer;
  $("#reviewer-id").value = reviewer;
  const allowedIds = new Set(state.dataset.images.flatMap((image) => image.cards.map((card) => card.id)));
  for (const [itemId, imported] of Object.entries(incomingAnswers)) {
    if (!allowedIds.has(itemId)) throw new Error(`留档包含未知文本编号：${itemId}`);
    const existing = answerFor(itemId);
    const next = { scores: { ...existing.scores }, comment: existing.comment || "" };
    for (const { key } of DIMENSIONS) {
      if (imported.scores[key] !== undefined && imported.scores[key] !== "") next.scores[key] = Number(imported.scores[key]);
    }
    if (imported.comment !== undefined && imported.comment !== "") next.comment = String(imported.comment);
    state.answers[itemId] = next;
  }
  const requestedImage = Math.max(0, Math.min(state.dataset.images.length - 1, Number(currentImage) || 0));
  const firstIncomplete = state.dataset.images.findIndex((image) => image.cards.some((card) => !complete(card.id)));
  state.currentImage = firstIncomplete >= 0 ? firstIncomplete : requestedImage;
  sessionStorage.setItem("art-review-last-user", reviewer);
  save(); renderImagePicker(); render();
  toast(`已恢复 ${Object.keys(incomingAnswers).length} 条留档记录`);
}
function restoreJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(String(reader.result));
      const reviewer = backup.reviewer_name || backup.reviewer_id;
      if (backup.version !== 1 || !reviewer || !backup.answers) throw new Error("无效 JSON 备份格式");
      applyImportedAnswers(reviewer, backup.answers, backup.current_image);
    } catch (error) { toast(error.message || "无法读取该备份"); }
  };
  reader.readAsText(file);
}
function parseXml(text, filename) {
  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error(`Excel 文件中的 ${filename} XML 无法解析`);
  return documentXml;
}
function nodeText(node) {
  return Array.from(node.getElementsByTagNameNS("*", "t"), (item) => item.textContent || "").join("");
}
function columnIndex(reference) {
  const letters = String(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}
async function readXlsxRows(file) {
  if (!window.JSZip) throw new Error("Excel 留档组件没有载入，请刷新页面后重试");
  const zip = await JSZip.loadAsync(file);
  const workbookFile = zip.file("xl/workbook.xml");
  const relationsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationsFile) throw new Error("这不是有效的 Excel 工作簿");
  const workbook = parseXml(await workbookFile.async("text"), "workbook");
  const relations = parseXml(await relationsFile.async("text"), "workbook relationships");
  const firstSheet = workbook.getElementsByTagNameNS("*", "sheet")[0];
  if (!firstSheet) throw new Error("Excel 文件中没有工作表");
  const relationId = firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relation = Array.from(relations.getElementsByTagNameNS("*", "Relationship")).find((item) => item.getAttribute("Id") === relationId);
  if (!relation) throw new Error("找不到 Excel 的评分工作表");
  const target = relation.getAttribute("Target").replace(/^\//, "");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("评分工作表缺失");
  const sheet = parseXml(await sheetFile.async("text"), "worksheet");
  let sharedStrings = [];
  const stringsFile = zip.file("xl/sharedStrings.xml");
  if (stringsFile) {
    const stringsXml = parseXml(await stringsFile.async("text"), "shared strings");
    sharedStrings = Array.from(stringsXml.getElementsByTagNameNS("*", "si"), nodeText);
  }
  return Array.from(sheet.getElementsByTagNameNS("*", "row"), (row) => {
    const values = [];
    for (const cell of row.getElementsByTagNameNS("*", "c")) {
      const index = columnIndex(cell.getAttribute("r"));
      if (index < 0) continue;
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") value = nodeText(cell);
      else {
        const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
        value = valueNode?.textContent || "";
        if (type === "s" && value !== "") value = sharedStrings[Number(value)] ?? "";
      }
      values[index] = value;
    }
    return values;
  });
}
async function restoreXlsx(file) {
  const rows = await readXlsxRows(file);
  if (rows.length < 2) throw new Error("Excel 留档没有评分记录");
  const header = rows[0].map((value) => String(value ?? "").trim());
  const columns = Object.fromEntries(EXPORT_COLUMNS.map((name) => [name, header.indexOf(name)]));
  const missing = EXPORT_COLUMNS.filter((name) => columns[name] < 0);
  if (missing.length) throw new Error(`Excel 表头不完整，缺少：${missing.join("、")}`);
  const byId = new Map();
  let reviewer = "";
  for (const row of rows.slice(1)) {
    const itemId = String(row[columns.item_id] ?? "").trim();
    if (!itemId) continue;
    if (byId.has(itemId)) throw new Error(`Excel 中有重复文本编号：${itemId}`);
    const rowReviewer = String(row[columns.reviewer_name] ?? "").trim();
    if (rowReviewer && reviewer && reviewer !== rowReviewer) throw new Error("Excel 文件包含多个评审者姓名");
    if (rowReviewer) reviewer = rowReviewer;
    const scores = {};
    for (const { key } of DIMENSIONS) {
      const value = String(row[columns[key]] ?? "").trim();
      if (value === "") continue;
      const score = Number(value);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`文本 ${itemId} 的评分 ${key} 必须是 1–5 的整数`);
      scores[key] = score;
    }
    byId.set(itemId, { scores, comment: String(row[columns.comment] ?? "") });
  }
  const expectedIds = new Set(state.dataset.images.flatMap((image) => image.cards.map((card) => card.id)));
  if (!reviewer) throw new Error("工作表中没有评审者姓名，请保留 reviewer_name 列");
  if (byId.size !== expectedIds.size || Array.from(expectedIds).some((id) => !byId.has(id))) throw new Error(`留档须包含全部 ${expectedIds.size} 个 item_id 行；请不要删除未评分的空白行`);
  applyImportedAnswers(reviewer, Object.fromEntries(byId));
}
async function importFile(file) {
  if (/\.xlsx$/i.test(file.name)) await restoreXlsx(file);
  else if (/\.json$/i.test(file.name)) restoreJson(file);
  else throw new Error("请选择网站导出的 .xlsx 或 .json 留档文件");
}

async function init() {
  renderRubrics();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(new URL("data/review_data.json", document.baseURI), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error("评审数据载入失败");
    state.dataset = await response.json();
    if (state.dataset.images.length !== 50 || state.dataset.images.some((image) => image.cards.length !== 8)) throw new Error("评审数据完整性检查失败");
    $("#reviewer-id").addEventListener("change", loadReviewer);
    $("#reviewer-id").addEventListener("keydown", (event) => { if (event.key === "Enter") loadReviewer(); });
    $("#image-picker").addEventListener("change", (event) => { state.currentImage = Number(event.target.value); save(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    $("#previous-button").addEventListener("click", () => moveImage(-1));
    $("#previous-bottom").addEventListener("click", () => moveImage(-1));
    $("#next-button").addEventListener("click", () => moveImage(1));
    $("#next-bottom").addEventListener("click", () => moveImage(1));
    $("#export-button").addEventListener("click", openExportDialog);
    $("#download-xlsx").addEventListener("click", exportXlsx);
    $("#download-csv").addEventListener("click", exportCsv);
    $("#download-json").addEventListener("click", exportJson);
    $("#rubric-button").addEventListener("click", () => $("#rubric-dialog").showModal());
    $("#close-rubric").addEventListener("click", () => $("#rubric-dialog").close());
    $("#close-export").addEventListener("click", () => $("#export-dialog").close());
    $("#import-button").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) {
        try { await importFile(file); }
        catch (error) { toast(error.message || "无法读取该留档"); }
      }
      event.target.value = "";
    });
    $("#reviewer-id").value = sessionStorage.getItem("art-review-last-user") || "";
    if ($("#reviewer-id").value) loadReviewer(); else { renderImagePicker(); render(); }
    $("#reviewer-id").addEventListener("change", () => sessionStorage.setItem("art-review-last-user", state.reviewer));
  } catch (error) {
    const message = error.name === "AbortError" ? "评审数据载入超时" : `页面初始化失败：${error.message}`;
    $("#loading").innerHTML = `${escapeHtml(message)}。请刷新页面重试；若持续出现，请联系研究团队。<br><button id="retry-load" class="button button-light" type="button">重新载入</button>`;
    $("#retry-load").addEventListener("click", () => window.location.reload());
  }
}

init();
