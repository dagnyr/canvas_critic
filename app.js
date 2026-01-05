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
      return (
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        `${c.code} ${c.title}`.toLowerCase().includes(q)
      );
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
  ul.innerHTML = categories.map(cat => {
    const href = `category.html?cat=${encodeURIComponent(cat.name)}`;
    return `<li><a href="${href}">${escapeHtml(cat.name)}</a> (${cat.count})</li>`;
  }).join("");
}

// ========= CATEGORY PAGE =========
async function renderCategory() {
  const cat = getParam("cat") || "";
  $("catTitle").textContent = cat || "category";

  const classes = await loadJSON("data/classes.json");
  const filtered = classes.filter(c => c.category === cat);

  const ul = $("classList");
  const empty = $("emptyNote");

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
  return await res.json(); // array
}

async function postReview(classId, rating, comment) {
  const res = await fetch(`${WORKER_URL}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_id: classId, rating, comment })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to submit review");
  }
}

// ========= CLASS PAGE =========
async function renderClass() {
  const id = getParam("id");
  const cat = getParam("cat");

  const classes = await loadJSON("data/classes.json");
  const cls = classes.find(c => c.id === id);

  if (!cls) {
    $("classTitle").textContent = "Class not found";
    $("summary").textContent = "";
    return;
  }

  $("classTitle").textContent = `${cls.code} ${cls.title}`;

  const back = $("backLink");
  if (cat) back.href = `category.html?cat=${encodeURIComponent(cat)}`;

  const form = $("reviewForm");
  const msg = $("formMsg");
  const reviewsDiv = $("reviews");
  const summary = $("summary");

  async function refresh() {
    summary.textContent = "Loading…";
    reviewsDiv.innerHTML = "";

    const reviews = await fetchReviews(cls.id);

    if (reviews.length === 0) {
      summary.textContent = "No reviews yet.";
      reviewsDiv.innerHTML = `<p class="muted">Be the first to review this class.</p>`;
      return;
    }

    const avg = reviews.reduce((a, r) => a + Number(r.rating), 0) / reviews.length;
    summary.textContent = `Average: ${avg.toFixed(2)} / 5 (${reviews.length} review${reviews.length === 1 ? "" : "s"})`;

    reviewsDiv.innerHTML = reviews.map(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      return `
        <div class="review">
          <div class="meta">
            <span class="rating">⭐ ${escapeHtml(String(r.rating))}/5</span>
            <span>${escapeHtml(date)}</span>
          </div>
          <div>${escapeHtml(r.comment || "")}</div>
        </div>
      `;
    }).join("");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const fd = new FormData(form);
    const rating = Number(fd.get("rating"));
    const comment = String(fd.get("comment") || "").trim();

    try {
      form.querySelector("button").disabled = true;
      msg.textContent = "Posting…";
      await postReview(cls.id, rating, comment);
      form.reset();
      msg.textContent = "Posted!";
      await refresh();
    } catch (err) {
      msg.textContent = `Error: ${err.message}`;
    } finally {
      form.querySelector("button").disabled = false;
      setTimeout(() => { msg.textContent = ""; }, 3000);
    }
  });

  // initial load
  try {
    await refresh();
  } catch (err) {
    summary.textContent = "Couldn’t load reviews (Worker URL wrong or Worker not deployed yet).";
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
