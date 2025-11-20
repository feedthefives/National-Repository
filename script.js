const API_BASE = "https://national-repository.feedthefives.workers.dev/api";
const PAGE_SIZE = 20;

let currentQuery = "";
let currentPage = 1;
let totalResults = 0;

const $ = sel => document.querySelector(sel);

const resultsGrid = $("#resultsGrid");
const resultsSummary = $("#resultsSummary");
const filtersPanel = $("#filtersPanel");
const resultsPanel = $("#resultsPanel");

const yearFilter = $("#yearFilter");
const institutionFilter = $("#institutionFilter");
const authorFilter = $("#authorFilter");
const keywordFilter = $("#keywordFilter");

const pageInfo = $("#pageInfo");
const prevPageBtn = $("#prevPage");
const nextPageBtn = $("#nextPage");
const paginationEl = $("#pagination");

const statusBox = $("#systemStatus");

/* ---------------------------------------------------
   SUMMARY HELPER
--------------------------------------------------- */
function setSummary(text) {
  if (!resultsSummary) return;
  resultsSummary.textContent = text || "";
}

/* ---------------------------------------------------
   AUTO HARVEST ON LOAD (non-blocking)
--------------------------------------------------- */
async function autoHarvestOnLoad() {
  try {
    // Kick off a harvest in the background – do NOT block UI
    fetch(`${API_BASE}/harvest-now`).catch(console.error);

    // Immediately load whatever is already cached
    await loadFilters();
    await loadHealth();
    await loadInitialRecords();
  } catch (e) {
    console.error("Auto-harvest error:", e);
    setSummary("Could not auto-harvest. Try searching.");
  }
}

/* ---------------------------------------------------
   Load initial cached records (no query)
--------------------------------------------------- */
async function loadInitialRecords() {
  try {
    const params = new URLSearchParams({
      page: "1",
      pageSize: String(PAGE_SIZE)
    });

    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      renderEmpty("Start typing above to search the national theses repository.");
      setSummary("");
      return;
    }

    resultsPanel.classList.remove("hidden");
    filtersPanel.classList.remove("hidden");

    totalResults = data.total || data.results.length;
    renderResults(data.results);
    updatePagination();
    setSummary(`${totalResults.toLocaleString()} cached theses available`);
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

    (data.years || []).forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearFilter.appendChild(opt);
    });

    (data.institutions || []).forEach(inst => {
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

    const url = r.url || "";
    const isHandle = url.includes("handle.net");
    const handleText = isHandle ? url.replace(/^https?:\/\//, "") : "";

    const yearLine = r.year ? `Year: ${r.year}<br>` : "";
    const handleLine = handleText ? `Handle: ${handleText}` : "";

    resultsGrid.innerHTML += `
      <article class="card">
        <div class="card-header-top">
          <span class="card-pill">Thesis</span>
          <span class="card-inst">${r.institution || ""}</span>
        </div>

        <h3 class="card-title">${r.title || "Untitled thesis"}</h3>

        ${authors ? `<div class="card-authors">${authors}</div>` : ""}

        <div class="card-meta-row">
          <div class="card-meta">
            ${yearLine}
            ${handleLine}
          </div>

          <div class="card-actions">
            ${
              isHandle
                ? `<a href="${url}" target="_blank" rel="noopener noreferrer">View thesis</a>`
                : ""
            }
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

/* ---------------------------------------------------
   Pagination
--------------------------------------------------- */
function updatePagination() {
  if (!paginationEl) return;

  if (totalResults <= PAGE_SIZE) {
    paginationEl.style.display = "none";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  paginationEl.style.display = "flex";
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

/* ---------------------------------------------------
   Perform search (Option B – debounced)
--------------------------------------------------- */
async function performSearch(page = 1) {
  currentPage = page;

  const q = currentQuery.trim();
  const year = yearFilter.value;
  const inst = institutionFilter.value;
  const author = (authorFilter.value || "").trim();
  const keyword = (keywordFilter.value || "").trim();

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE)
  });

  if (q) params.set("q", q);
  if (year) params.set("year", year);
  if (inst) params.set("institution", inst);
  if (author) params.set("author", author);
  if (keyword) params.set("keyword", keyword);

  try {
    resultsGrid.innerHTML = `
      <div class="empty-state">
        <h3>Searching theses…</h3>
        <p>Please wait while we query the national repositories.</p>
      </div>
    `;
    setSummary("Searching national repositories…");

    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    const data = await res.json();

    totalResults = data.total || 0;

    if (totalResults === 0) {
      renderEmpty("No theses match your search.");
      paginationEl.style.display = "none";
      setSummary("0 results.");
      return;
    }

    renderResults(data.results);
    updatePagination();

    setSummary(
      `${totalResults.toLocaleString()} result${totalResults === 1 ? "" : "s"} found`
    );
  } catch (e) {
    console.error("Search error", e);
    renderError("Search failed.");
    setSummary("An error occurred while searching.");
  }
}

/* ---------------------------------------------------
   Debounce for live-search (Option B)
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
  autoHarvestOnLoad();

  const searchInput = $("#searchInput");
  const searchButton = $("#searchButton");

  // MAIN LIVE SEARCH (q) – triggers live harvest in Worker
  searchInput.addEventListener("input", e => {
    currentQuery = e.target.value;
    debouncedSearch();
  });

  searchButton.addEventListener("click", () => {
    currentQuery = searchInput.value;
    performSearch(1);
  });

  // Pagination
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) performSearch(currentPage - 1);
  });

  nextPageBtn.addEventListener("click", () => {
    performSearch(currentPage + 1);
  });

  // Filters – search immediately when changed
  yearFilter.addEventListener("change", () => performSearch(1));
  institutionFilter.addEventListener("change", () => performSearch(1));

  authorFilter.addEventListener("input", debounce(() => performSearch(1), 400));
  keywordFilter.addEventListener("input", debounce(() => performSearch(1), 400));

  // Clear filters
  $("#clearFilters").addEventListener("click", () => {
    yearFilter.value = "";
    institutionFilter.value = "";
    authorFilter.value = "";
    keywordFilter.value = "";
    performSearch(1);
  });
});
