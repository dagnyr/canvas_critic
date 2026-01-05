// ========= CONFIG =========
// Put your Worker URL here once you deploy it, e.g.
// https://class-reviews.yourname.workers.dev
const WORKER_URL = "https://YOUR-WORKER-URL.workers.dev";

// ========= HELPERS =========
function $(id) { return document.getElementById(id); }

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ========= SEARCH (client-side) =========
function setupSearch(classes) {
  const input = $("searchInput");
  const out = $("searchResults");
  if (!input || !out) return;

  function render(items) {
    if (items.length === 0) {
      out.innerHTML = `<div class="muted">No matches</div>`;
      return;
    }
    out.innerHTML = items.slice(0, 12).map(c => {
      const label = `${c.code} ${c.title}`;
      const href = `class.html?id=${encodeURIComponent(c.id)}&cat=${encodeURIComponent(c.category)}`;
      return `<div class="search-item"><a href="${href}">${escapeHtml(label)}</a></div>`;
    }).join("");
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length === 0) {
      out.innerHTML = `<div class="muted">Type to search…</div>`;
      return;
    }
    const matches = classes.filter(c => {
      const code = String(c.code || "").toLowerCase();
      const title = String(c.title || "").toLowerCase();
      const both = `${code} ${title}`;
      return code.includes(q) || title.includes(q) || both.includes(q);
    });
    render(matches);
  });

  out.innerHTML = `<div class="muted">Type to search…</div>`;
}

// ========= HOME PAGE =========
async function renderHome() {
  const categories = await loadJSON("data/categories.json");
  const classes = await loadJSON("data/classes.json");

  setupSearch(classes);

  const ul = $("categoryList");
  if (!ul) return;

  ul.innerHTML = categories.map(cat => {
    const name = cat?.name ?? "";
    const count = cat?.count ?? "";
    const href = `category.html?cat=${encodeURIComponent(name)}`;
    return `<li><a href="${href}">${escapeHtml(name)}</a> (${escapeHtml(String(count))})</li>`;
  }).join("");
}

// ========= CATEGORY PAGE =========
async function renderCategory() {
  const cat = getParam("cat") || "";

  const title = $("catTitle");
  if (title) title.textContent = cat || "category";

  const classes = await loadJSON("data/classes.json");
  const filtered = classes.filter(c => c.category === cat);

  const ul = $("classList");
  const empty = $("emptyNote");
  if (!ul || !empty) return;

  if (filtered.length === 0) {
    ul.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  ul.innerHTML = filtered.map(c => {
    const label = `${c.code} ${c.title}`;
    const href = `class.html?id=${encodeURIComponent(c.id)}&cat=${encodeURIComponent(cat)}`;
    return `<li><a href="${href}">${escapeHtml(label)}</a></li>`;
  }).join("");
}

// ========= REVIEWS (Worker) =========
async function fetchReviews(classId) {
  const res = await fetch(`${WORKER_URL}/reviews?class_id=${encodeURIComponent(classId)}`);
  if (!res.ok) throw new Error("Failed to fetch reviews");
  return await res.json(); // { summary, reviews }
}

async function postReview(payload) {
  const res = await fetch(`${WORKER_URL}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to submit review");
  }

  // Optional: return response if your Worker sends JSON back
  try { return await res.json(); } catch { return null; }
}

// ========= CLASS PAGE =========
async function renderClass() {
  const id = getParam("id");
  const cat = getParam("cat");

  const classes = await loadJSON("data/classes.json");
  const cls = classes.find(c => c.id === id);

  const titleEl = $("classTitle");
  const summaryEl = $("summary");
  const reviewsDiv = $("reviews");
  const form = $("reviewForm");
  const msg = $("formMsg");
  const back = $("backLink");

  if (!titleEl || !summaryEl || !reviewsDiv) return;

  if (!cls) {
    titleEl.textContent = "Class not found";
    summaryEl.textContent = "";
    reviewsDiv.innerHTML = "";
    return;
  }

  titleEl.textContent = `${cls.code} ${cls.title}`;

  if (back && cat) back.href = `category.html?cat=${encodeURIComponent(cat)}`;

  async function refresh() {
    summaryEl.textContent = "Loading…";
    reviewsDiv.innerHTML = "";

    const data = await fetchReviews(cls.id);
    const summaryObj = data?.summary;
    const reviews = data?.reviews || [];

    if (!summaryObj || summaryObj.n === 0) {
      summaryEl.textContent = "No reviews yet.";
      reviewsDiv.innerHTML = `<p class="muted">Be the first to review this class.</p>`;
      return;
    }

    summaryEl.innerHTML =
      `Overall: <b>${Number(summaryObj.overall_avg).toFixed(2)}</b> / 5 (${summaryObj.n})<br>` +
      `Difficulty: ${Number(summaryObj.difficulty_avg).toFixed(2)} / 5<br>` +
      `Engaging: ${Number(summaryObj.engaging_avg).toFixed(2)} / 5<br>` +
      `Instruction: ${Number(summaryObj.instruction_avg).toFixed(2)} / 5<br>` +
      `Final intensity: ${Number(summaryObj.final_intensity_avg).toFixed(2)} / 5<br>` +
      (summaryObj.hours_per_week_avg == null ? "" : `Hours/week: ${Number(summaryObj.hours_per_week_avg).toFixed(1)}<br>`) +
      (summaryObj.recommend_pct == null ? "" : `Would recommend: ${Number(summaryObj.recommend_pct).toFixed(0)}%`);

    reviewsDiv.innerHTML = reviews.map(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const hours = (r.hours_per_week == null || r.hours_per_week === "") ? "" : ` · Hours/week: ${escapeHtml(String(r.hours_per_week))}`;
      const rec = Number(r.recommend) === 1 ? " · Would recommend" : "";
      const comment = (r.comment || "").trim();

      return `
        <div class="review">
          <div class="meta">
            <span class="rating">Overall ⭐ ${escapeHtml(String(r.overall))}/5</span>
            <span>${escapeHtml(date)}</span>
          </div>
          <div class="muted">
            Difficulty: ${escapeHtml(String(r.difficulty))}/5 ·
            Engaging: ${escapeHtml(String(r.engaging))}/5 ·
            Instruction: ${escapeHtml(String(r.instruction))}/5 ·
            Final: ${escapeHtml(String(r.final_intensity))}/5
            ${hours}${rec}
          </div>
          ${comment ? `<div>${escapeHtml(comment)}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  // Attach submit handler ONCE (not inside refresh)
  if (form && msg) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.textContent = "";

      const btn = form.querySelector("button");
      if (btn) btn.disabled = true;

      try {
        const fd = new FormData(form);
        const payload = {
          class_id: cls.id,
          overall: Number(fd.get("overall")),
          difficulty: Number(fd.get("difficulty")),
          engaging: Number(fd.get("engaging")),
          instruction: Number(fd.get("instruction")),
          final_intensity: Number(fd.get("final_intensity")),
          hours_per_week: fd.get("hours_per_week") === "" ? null : Number(fd.get("hours_per_week")),
          // send as 1/0 so it matches your rendering logic
          recommend: fd.get("recommend") === "on" ? 1 : 0,
          comment: String(fd.get("comment") || "").trim()
        };

        await postReview(payload);
        form.reset();
        msg.textContent = "Posted!";
        await refresh();
      } catch (err) {
        msg.textContent = `Error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
        setTimeout(() => { msg.textContent = ""; }, 3000);
      }
    });
  }

  // initial load
  try {
    await refresh();
  } catch (err) {
    summaryEl.textContent = "Couldn’t load reviews (Worker URL wrong or Worker not deployed yet).";
  }
}

// ========= ENTRY =========
async function init() {
  try {
    if (window.PAGE === "home") return await renderHome();
    if (window.PAGE === "category") return await renderCategory();
    if (window.PAGE === "class") return await renderClass();
  } catch (err) {
    console.error(err);
  }
}

// IMPORTANT: actually run init so pages render
document.addEventListener("DOMContentLoaded", init);
