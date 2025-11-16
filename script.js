// 🔗 IMPORTANT: put your real Worker URL here
// Example: "https://national-repository.yourname.workers.dev/api"
const API_BASE = "https://YOUR-WORKER-SUBDOMAIN.workers.dev/api";

const PAGE_SIZE = 24;
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;
let selectedCount = 0;
let lastHarvestTime = 0;
const HARVEST_INTERVAL = 30 * 60 * 1000; // 30 minutes

/* ---------- helpers ---------- */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const show = (el) => el && (el.style.display = "");
const hide = (el) => el && (el.style.display = "none");

/* ---------- Smart Search (theses only) ---------- */
/**
 * Cached-first search:
 *  1) Use KV cache via /api/harvest → fast results
 *  2) Trigger background incremental harvest (theses)
 *  3) After harvest, auto-refresh same query without re-harvesting
 */
async function smartSearch(page = 1, options = {}) {
  const { runHarvest = true } = options;
  currentPage = page;

  const progress = qs("#progressBar");
  const progressContainer = qs(".progress-bar");
  if (progress && progressContainer) {
    progressContainer.style.display = "block";
    progress.style.width = "25%";
  }

  showLoadingState();

  console.log(
    `🔍 Smart Search (theses only): page=${page}, query="${currentQuery}", runHarvest=${runHarvest}`
  );

  try {
    const apiUrl = `${API_BASE}/harvest`;
    const body = {
      category: "theses",
      query: currentQuery,
      page: currentPage,
      pageSize: PAGE_SIZE,
      filters: currentFilters,
    };

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log("📦 API Response:", data);

    if (!data.success) {
      throw new Error(data.error || "API returned failure");
    }

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid response format: results array missing");
    }

    renderResults(data.results);

    renderFilters(data.facets);
    show(qs("#filtersSidebar"));

    const totalRecords = data.total || 0;
    totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    updatePagination(data.page, totalPages, totalRecords);

    if (progress && progressContainer) {
      progress.style.width = "100%";
      setTimeout(() => {
        progressContainer.style.display = "none";
        progress.style.width = "0%";
      }, 500);
    }

    // Background incremental harvest → then refresh
    if (runHarvest) {
      triggerAutoHarvest(true);
    }
  } catch (e) {
    console.error("❌ Search error:", e);
    renderError(e.message);
    if (progress && progressContainer) {
      progress.style.width = "0%";
      progressContainer.style.display = "none";
    }
  }
}

function showLoadingState() {
  const c = qs("#dataCardsContainer");
  if (!c) return;

  c.innerHTML = `
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i>
      <h3>Loading Theses & Dissertations</h3>
      <p>Searching harvested records from South African institutional repositories...</p>
    </div>`;
}

/* ---------- Auto-Harvest (incremental) ---------- */

async function triggerAutoHarvest(refreshAfter = false) {
  const now = Date.now();

  if (now - lastHarvestTime < HARVEST_INTERVAL) {
    console.log(
      "⏱️  Skipping live harvest – using cached data. Last harvest:",
      new Date(lastHarvestTime).toLocaleTimeString()
    );
    return { skipped: true };
  }

  console.log("🔄 Background incremental harvest for theses…");

  try {
    const response = await fetch(`${API_BASE}/harvest-incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "theses" }),
    });

    const result = await response.json();
    console.log("📥 Incremental harvest result:", result);

    if (result.success) {
      lastHarvestTime = now;
      showHarvestNotification(result.newRecords || 0);
      setTimeout(() => checkSystemHealth(), 2000);

      if (refreshAfter && result.newRecords > 0) {
        console.log("🔁 Refreshing search results after live harvest…");
        smartSearch(currentPage, { runHarvest: false });
      }
    } else {
      console.error("❌ Incremental harvest failed:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ Auto-harvest request failed:", error);
    return { success: false, error: error.message };
  }
}

function showHarvestNotification(newRecords) {
  if (!newRecords || newRecords === 0) return;

  const notification = qs("#harvestNotification");
  if (!notification) return;

  notification.textContent = `🔄 Added ${newRecords} new theses/dissertations from live sources`;
  notification.style.display = "block";

  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

/* ---------- render: results ---------- */

function renderResults(records = []) {
  const c = qs("#dataCardsContainer");
  if (!c) {
    console.error("Could not find dataCardsContainer");
    return;
  }

  c.innerHTML = "";

  if (!records.length) {
    c.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>No theses/dissertations match this search. Try different keywords or filters.</p>
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  console.log(`🎨 Rendering ${records.length} records`);

  for (const r of records) {
    try {
      const recJSON = encodeURIComponent(JSON.stringify(r));
      const authors = Array.isArray(r.authors)
        ? r.authors.join(", ")
        : r.authors || "";
      const desc = (r.description || "").trim();
      const title = r.title || "Untitled";
      const source = r.source || "Unknown";
      const type = r.type || "Thesis/Dissertation";
      const year = r.year || "—";
      const identifier = r.identifier || "—";
      const url = r.url || "#";

      const hasValidUrl =
        url &&
        url !== "#" &&
        (url.startsWith("http://") || url.startsWith("https://"));

      c.insertAdjacentHTML(
        "beforeend",
        `
        <div class="data-card">
          <div class="card-header">
            <span class="card-type">${type}</span>
            <span class="card-source">${source}</span>
          </div>
          <div class="card-body">
            <h3 class="card-title">${title}</h3>
            ${authors ? `<p class="card-authors">${authors}</p>` : ""}
            ${
              desc
                ? `<p class="card-description">${
                    desc.length > 300 ? desc.slice(0, 300) + "…" : desc
                  }</p>`
                : ""
            }
          </div>
          <div class="card-footer">
            <div class="card-meta">
              <span><b>Year:</b> ${year}</span>
              <span><b>ID:</b> ${identifier}</span>
            </div>
            <div class="card-actions">
              ${
                hasValidUrl
                  ? `<a class="btn sm" href="${url}" target="_blank" rel="noopener">
                       <i class="fas fa-external-link-alt"></i> Open
                     </a>`
                  : `<span class="btn sm disabled">
                       <i class="fas fa-unlink"></i> No URL
                     </span>`
              }
              <input class="select-record" type="checkbox" data-record="${recJSON}">
            </div>
          </div>
        </div>
      `
      );
    } catch (err) {
      console.error("Error rendering record:", err, r);
    }
  }

  qsa(".select-record").forEach((cb) => {
    cb.addEventListener("change", updateSelectedCount);
  });

  updateSelectedCount();
  show(qs("#pagination"));
}

/* ---------- selected records count ---------- */

function updateSelectedCount() {
  selectedCount = qsa(".select-record:checked").length;
  const risBtn = qs("#bulkRisButton");

  if (risBtn) {
    if (selectedCount > 0) {
      risBtn.style.display = "flex";
      risBtn.innerHTML = `<i class="fas fa-download"></i> Export RIS (${selectedCount})`;
    } else {
      risBtn.style.display = "none";
    }
  }
}

/* ---------- filters ---------- */

function renderFilters(facets) {
  const wrap = qs("#filtersWrap");
  if (!facets || !wrap) return;

  const years = facets.years || [];
  const repositories = facets.repositories || [];

  wrap.innerHTML = `
    <div class="filter">
      <label>Year</label>
      <select id="fltYear">
        <option value="">All Years</option>
        ${years
          .map((y) => `<option value="${y.name}">${y.name} (${y.count})</option>`)
          .join("")}
      </select>
    </div>
    <div class="filter">
      <label>Repository</label>
      <select id="fltRepo">
        <option value="">All Repositories</option>
        ${repositories
          .map(
            (r) => `<option value="${r.name}">${r.name} (${r.count})</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="filter">
      <label>Author contains</label>
      <input id="fltAuthor" type="text" placeholder="e.g. Smith" />
    </div>
    <button id="applyFilters" class="btn sm"><i class="fa-solid fa-filter"></i> Apply Filters</button>
  `;

  const applyBtn = qs("#applyFilters");
  if (applyBtn) {
    applyBtn.onclick = () => {
      currentFilters = {
        year: qs("#fltYear").value,
        repository: qs("#fltRepo").value,
        author: qs("#fltAuthor").value,
      };
      console.log("🎯 Applying filters:", currentFilters);
      smartSearch(1);
    };
  }
}

/* ---------- pagination ---------- */

function updatePagination(page, computedTotalPages, total) {
  currentPage = page;
  totalPages = computedTotalPages || 1;

  const pageInfo = qs("#pageInfo");
  const totalInfo = qs("#totalInfo");
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");

  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (totalInfo) totalInfo.textContent = `${total} records`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

/* ---------- System Health Monitoring ---------- */

async function checkSystemHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    updateSystemInfo(data);

    if (data.harvest?.last_harvest && data.harvest.last_harvest !== "Never") {
      lastHarvestTime = new Date(data.harvest.last_harvest).getTime();
    }
  } catch (e) {
    console.error("Health check failed:", e);
    updateSystemInfo({ error: "Health check failed" });
  }
}

function updateSystemInfo(data) {
  const el = qs("#systemInfo");
  if (!el) return;

  if (data.error) {
    el.innerHTML = `<span style="color: #dc3545;">❌ ${data.error}</span>`;
    return;
  }

  const healthData = data.data || {};
  const lastHarvest = data.harvest?.last_harvest
    ? new Date(data.harvest.last_harvest).toLocaleString()
    : "Never";

  el.innerHTML = `
    <div><b>Total Theses/Dissertations:</b> ${healthData.theses?.toLocaleString() || 0}</div>
    <div><b>Repositories:</b> ${data.repositories?.academic || 0}</div>
    <div><b>Last Harvest:</b> ${lastHarvest}</div>
    <div><b>Next Harvest:</b> ${data.harvest?.next_harvest || "Daily at 2 AM"}</div>
  `;
}

/* ---------- error ---------- */

function renderError(msg) {
  const c = qs("#dataCardsContainer");
  if (!c) return;

  c.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error Loading Data</h3>
      <p>${msg}</p>
      <p><small>Check the console for more details.</small></p>
    </div>`;

  hide(qs("#pagination"));
}

/* ---------- bulk RIS ---------- */

async function exportRIS() {
  const selected = qsa(".select-record:checked")
    .map((cb) => {
      try {
        return JSON.parse(decodeURIComponent(cb.dataset.record));
      } catch (e) {
        console.error("Error parsing record:", e);
        return null;
      }
    })
    .filter((record) => record !== null);

  if (!selected.length) {
    alert("Select at least one record.");
    return;
  }

  console.log(`Exporting ${selected.length} records to RIS`);

  try {
    const res = await fetch(`${API_BASE}/ris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: selected }),
    });

    if (!res.ok) {
      throw new Error(`Export failed: HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "national_repository_theses.ris";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("RIS export error:", e);
    alert("Export failed: " + e.message);
  }
}

/* ---------- event listeners ---------- */

function initializeEventListeners() {
  const searchBtn = qs("#searchBtn");
  const searchBox = qs("#searchBox");
  const clearBtn = qs("#clearBtn");
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");
  const risBtn = qs("#bulkRisButton");

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      currentQuery = (qs("#searchBox")?.value || "").trim();
      console.log("Searching for:", currentQuery);
      smartSearch(1);
      show(clearBtn);
    });
  }

  if (searchBox) {
    searchBox.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        currentQuery = searchBox.value.trim();
        console.log("Searching (Enter):", currentQuery);
        smartSearch(1);
        show(clearBtn);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      currentQuery = "";
      currentFilters = {};
      if (searchBox) searchBox.value = "";
      console.log("🧹 Clearing search and filters");
      smartSearch(1);
      hide(clearBtn);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) smartSearch(currentPage - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) smartSearch(currentPage + 1);
    });
  }

  if (risBtn) {
    risBtn.addEventListener("click", exportRIS);
  }
}

/* ---------- initial load ---------- */

window.addEventListener("DOMContentLoaded", () => {
  console.log(
    "🚀 National Theses Repository UI initialised (cached-first + background harvest)"
  );
  initializeEventListeners();
  checkSystemHealth();
  smartSearch(1); // initial search

  // Refresh health every 5 minutes
  setInterval(checkSystemHealth, 300000);

  // Auto-harvest every 30 minutes if page remains open
  setInterval(() => {
    triggerAutoHarvest(false);
  }, HARVEST_INTERVAL);
});
