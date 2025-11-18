
const API_BASE = "https://national-repository.feedthefives.workers.dev/api";
const PAGE_SIZE = 20;

let currentQuery = "";
let currentPage = 1;
let totalResults = 0;
let isLiveSearching = false;

const $ = sel => document.querySelector(sel);

const resultsGrid = $("#resultsGrid");
const resultsSummary = $("#resultsSummary");
const filtersPanel = $("#filtersPanel");
const resultsPanel = $("#resultsPanel");

const yearFilter = $("#yearFilter");
const institutionFilter = $("#institutionFilter");

const pageInfo = $("#pageInfo");
const prevPageBtn = $("#prevPage");
const nextPageBtn = $("#nextPage");
const paginationEl = $("#pagination");

const statusBox = $("#systemStatus");

/* ---------------------------------------------------
   NEW: Load cached records IMMEDIATELY on UI open
--------------------------------------------------- */
async function initializeUI() {
  try {
    // Load everything in parallel for fastest display
    await Promise.all([
      loadInitialRecords(),
      loadFilters(),
      loadHealth()
    ]);
    
    // Start background harvest AFTER UI is responsive
    setTimeout(() => {
      triggerBackgroundHarvest();
    }, 1000);
  } catch (e) {
    console.error("UI initialization error:", e);
  }
}

/* ---------------------------------------------------
   NEW: Background harvest that doesn't block UI
--------------------------------------------------- */
async function triggerBackgroundHarvest() {
  try {
    console.log("Starting background harvest...");
    // Don't await - let it run in background
    fetch(`${API_BASE}/harvest-now`)
      .then(() => {
        console.log("Background harvest completed");
        // Optional: Refresh health stats after harvest
        loadHealth();
      })
      .catch(e => console.error("Background harvest failed:", e));
  } catch (e) {
    console.error("Background harvest error:", e);
  }
}

/* ---------------------------------------------------
   Load initial cached records (no query) - IMMEDIATE
--------------------------------------------------- */
async function loadInitialRecords() {
  try {
    const res = await fetch(`${API_BASE}/search?page=1&pageSize=${PAGE_SIZE}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      renderEmpty("Start typing above to search the national theses repository.");
      return;
    }

    resultsPanel.classList.remove("hidden");
    filtersPanel.classList.remove("hidden");

    totalResults = data.total;
    renderResults(data.results);
    updatePagination();
  } catch (e) {
    console.error(e);
    renderError("Could not load initial records.");
  }
}

/* ---------------------------------------------------
   Filters
--------------------------------------------------- */
async function loadFilters() {
  try {
    const res = await fetch(`${API_BASE}/filters`);
    const data = await res.json();

    yearFilter.innerHTML = `<option value="">All years</option>`;
    institutionFilter.innerHTML = `<option value="">All institutions</option>`;

    data.years.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearFilter.appendChild(opt);
    });

    data.institutions.forEach(inst => {
      const opt = document.createElement("option");
      opt.value = inst;
      opt.textContent = inst;
      institutionFilter.appendChild(opt);
    });

  } catch (e) {
    console.error("Filter load error", e);
  }
}

/* ---------------------------------------------------
   Health
--------------------------------------------------- */
async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();

    statusBox.innerHTML = `
      <div><strong>Total records:</strong> ${data.total_records.toLocaleString()}</div>
      <div><strong>Repositories:</strong> ${data.repositories}</div>
      <div style="font-size:11px;color:#6b7280;">Updated: ${new Date(data.time).toLocaleString()}</div>
    `;

  } catch (e) {
    console.error("Health load error", e);
    statusBox.textContent = "Could not load system status.";
  }
}

/* ---------------------------------------------------
   Rendering
--------------------------------------------------- */
function renderResults(records) {
  resultsGrid.innerHTML = "";
  resultsPanel.classList.remove("hidden");
  filtersPanel.classList.remove("hidden");

  records.forEach(r => {
    const authors = Array.isArray(r.authors)
      ? r.authors.join(", ")
      : (r.authors || "");

    resultsGrid.innerHTML += `
      <article class="card">
        <div class="card-header-top">
          <span class="card-pill">Thesis</span>
          <span class="card-inst">${r.institution}</span>
        </div>

        <h3 class="card-title">${r.title}</h3>

        ${authors ? `<div class="card-authors">${authors}</div>` : ""}

        <div class="card-meta-row">
          <div class="card-meta">
            ${r.year ? `Year: ${r.year}<br>` : ""}
            Handle: ${r.url.replace(/^https?:\/\//, "")}
          </div>

          <div class="card-actions">
            <a href="${r.url}" target="_blank">View thesis</a>
          </div>
        </div>
      </article>
    `;
  });
}

function renderEmpty(msg) {
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <h3>No theses found</h3>
      <p>${msg}</p>
    </div>`;
}

function renderError(msg) {
  resultsGrid.innerHTML = `
    <div class="error-state">
      <h3>Error loading data</h3>
      <p>${msg}</p>
    </div>`;
}

function renderLoading(msg = "Searching...") {
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <h3>${msg}</h3>
      <p>Live harvesting from repositories...</p>
    </div>`;
}

/* ---------------------------------------------------
   Pagination
--------------------------------------------------- */
function updatePagination() {
  if (totalResults <= PAGE_SIZE) {
    paginationEl.style.display = "none";
    return;
  }

  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  paginationEl.style.display = "flex";
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

/* ---------------------------------------------------
   NEW: Two-phase search - cached first, then live
--------------------------------------------------- */
async function performSearch(page = 1) {
  currentPage = page;
  const q = currentQuery.trim();
  const year = yearFilter.value;
  const inst = institutionFilter.value;

  // If no query, just do normal search
  if (!q) {
    await performCachedSearch(page, year, inst);
    return;
  }

  // For searches with query: TWO PHASE APPROACH
  await performTwoPhaseSearch(q, page, year, inst);
}

/* ---------------------------------------------------
   NEW: Phase 1 - Search cached data immediately
--------------------------------------------------- */
async function performCachedSearch(page = 1, year = "", inst = "") {
  const params = new URLSearchParams({
    page,
    pageSize: PAGE_SIZE,
    cachedOnly: "true"  // Tell backend to skip live harvest
  });

  if (year) params.set("year", year);
  if (inst) params.set("institution", inst);

  try {
    const res = await fetch(`${API_BASE}/search?${params}`);
    const data = await res.json();

    totalResults = data.total;

    if (totalResults === 0) {
      renderEmpty("No theses match your search.");
      paginationEl.style.display = "none";
      return;
    }

    renderResults(data.results);
    updatePagination();
  } catch (e) {
    console.error("Search error", e);
    renderError("Search failed.");
  }
}

/* ---------------------------------------------------
   NEW: Phase 2 - Cached first, then live harvest
--------------------------------------------------- */
async function performTwoPhaseSearch(q, page = 1, year = "", inst = "") {
  // PHASE 1: Show cached results immediately
  const cachedParams = new URLSearchParams({
    q,
    page,
    pageSize: PAGE_SIZE,
    cachedOnly: "true"  // Only search existing cache
  });

  if (year) cachedParams.set("year", year);
  if (inst) cachedParams.set("institution", inst);

  try {
    // First show whatever we have in cache
    const cachedRes = await fetch(`${API_BASE}/search?${cachedParams}`);
    const cachedData = await cachedRes.json();

    if (cachedData.results && cachedData.results.length > 0) {
      totalResults = cachedData.total;
      renderResults(cachedData.results);
      updatePagination();
    } else {
      // No cached results, show loading
      renderLoading("Searching repositories...");
    }

    // PHASE 2: Trigger live harvest in background
    const liveParams = new URLSearchParams({
      q,
    });
    if (year) liveParams.set("year", year);
    if (inst) liveParams.set("institution", inst);

    isLiveSearching = true;
    
    // Don't await - let it run in background
    fetch(`${API_BASE}/live-search?${liveParams}`)
      .then(async (liveRes) => {
        const liveData = await liveRes.json();
        console.log("Live search completed, found:", liveData.total, "results");
        
        // Refresh the display with newly harvested data
        await performCachedSearch(page, year, inst);
      })
      .catch(e => {
        console.error("Live search error:", e);
      })
      .finally(() => {
        isLiveSearching = false;
      });

  } catch (e) {
    console.error("Two-phase search error", e);
    renderError("Search failed.");
  }
}

/* ---------------------------------------------------
   Debounce for live-search
--------------------------------------------------- */
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const debouncedSearch = debounce(() => performSearch(1), 400);

/* ---------------------------------------------------
   Event Listeners
--------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initializeUI();  // Changed from autoHarvestOnLoad

  const searchInput = $("#searchInput");
  const searchButton = $("#searchButton");

  searchInput.addEventListener("input", e => {
    currentQuery = e.target.value;
    debouncedSearch();
  });

  searchButton.addEventListener("click", () => {
    currentQuery = searchInput.value;
    performSearch(1);
  });

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) performSearch(currentPage - 1);
  });

  nextPageBtn.addEventListener("click", () => {
    performSearch(currentPage + 1);
  });

  yearFilter.addEventListener("change", () => performSearch(1));
  institutionFilter.addEventListener("change", () => performSearch(1));

  $("#clearFilters").addEventListener("click", () => {
    yearFilter.value = "";
    institutionFilter.value = "";
    performSearch(1);
  });
});
