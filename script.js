const API_BASE  = "https://national-repository.feedthefives.workers.dev/api";
const PAGE_SIZE = 20;

let currentQuery = "";
let currentPage  = 1;
let totalResults = 0;

const $ = sel => document.querySelector(sel);

const resultsGrid     = $("#resultsGrid");
const resultsSummary  = $("#resultsSummary");
const filtersPanel    = $("#filtersPanel");
const resultsPanel    = $("#resultsPanel");

const yearFilter       = $("#yearFilter");
const institutionFilter= $("#institutionFilter");
const authorFilter     = $("#authorFilter");
const keywordFilter    = $("#keywordFilter");

const pageInfo   = $("#pageInfo");
const prevPageBtn= $("#prevPage");
const nextPageBtn= $("#nextPage");
const paginationEl = $("#pagination");

const statusBox  = $("#systemStatus");

/* ---------------------------------------------------
   INITIAL LOAD – harvest + filters + first page
--------------------------------------------------- */
async function initApp() {
  try {
    // quick manual harvest on load (non-blocking)
    fetch(`${API_BASE}/harvest-now`).catch(() => {});

    await loadHealth();
    await loadFilters();
    await loadInitialRecords();
  } catch (e) {
    console.error("Init error:", e);
    renderEmpty("Could not load initial data.");
  }
}

/* Load initial cached records */
async function loadInitialRecords() {
  try {
    const res = await fetch(`${API_BASE}/search?page=1&pageSize=${PAGE_SIZE}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      renderEmpty("Start typing above to search the national theses repository.");
      return;
    }

    totalResults = data.total;
    renderResults(data.results);
    updatePagination();
  } catch (e) {
    console.error("Initial load error:", e);
    renderError("Could not load initial records.");
  }
}

/* ---------------------------------------------------
   Filters + Health
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
    console.error("Health error", e);
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

    const handle = r.url || "";

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-top">
        <span class="card-pill">Thesis</span>
        <span class="card-inst">${r.institution || ""}</span>
      </div>
      <h3 class="card-title">${r.title || "Untitled thesis"}</h3>
      ${authors ? `<div class="card-authors">${authors}</div>` : ""}
      <div class="card-meta-row">
        <div class="card-meta">
          ${r.year ? `Year: ${r.year}<br>` : ""}
          ${handle ? `Handle: ${handle.replace(/^https?:\/\//, "")}` : ""}
        </div>
        <div class="card-actions">
          ${handle ? `<a href="${handle}" target="_blank" rel="noopener noreferrer">View thesis</a>` : ""}
        </div>
      </div>
    `;
    resultsGrid.appendChild(card);
  });

  resultsSummary.textContent =
    `${totalResults.toLocaleString()} result${totalResults === 1 ? "" : "s"} found`;
}

function renderEmpty(msg) {
  resultsPanel.classList.remove("hidden");
  filtersPanel.classList.remove("hidden");
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <h3>No theses found</h3>
      <p>${msg}</p>
    </div>`;
  resultsSummary.textContent = "";
}

function renderError(msg) {
  resultsPanel.classList.remove("hidden");
  filtersPanel.classList.remove("hidden");
  resultsGrid.innerHTML = `
    <div class="error-state">
      <h3>Error loading data</h3>
      <p>${msg}</p>
    </div>`;
  resultsSummary.textContent = "";
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
   Search (cached + live)
--------------------------------------------------- */

async function performSearch(page = 1) {
  currentPage = page;

  const q        = currentQuery.trim();
  const year     = yearFilter.value;
  const inst     = institutionFilter.value;
  const authorQ  = authorFilter.value.trim();
  const keywordQ = keywordFilter.value.trim();

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE)
  });

  if (q)        params.set("q", q);
  if (year)     params.set("year", year);
  if (inst)     params.set("institution", inst);
  if (authorQ)  params.set("author", authorQ);
  if (keywordQ) params.set("keyword", keywordQ);

  try {
    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    const data = await res.json();

    totalResults = data.total || 0;

    if (!data.results || data.results.length === 0) {
      renderEmpty("No theses match your current search and filters.");
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

/* Debounce typing */
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const debouncedSearch = debounce(() => performSearch(1), 400);

/* ---------------------------------------------------
   EVENT LISTENERS
--------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  initApp();

  const searchInput  = $("#searchInput");
  const searchButton = $("#searchButton");

  searchInput.addEventListener("input", e => {
    currentQuery = e.target.value || "";
    debouncedSearch();
  });

  searchButton.addEventListener("click", () => {
    currentQuery = searchInput.value || "";
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
  authorFilter.addEventListener("input", () => debouncedSearch());
  keywordFilter.addEventListener("input", () => debouncedSearch());

  $("#clearFilters").addEventListener("click", () => {
    yearFilter.value        = "";
    institutionFilter.value = "";
    authorFilter.value      = "";
    keywordFilter.value     = "";
    performSearch(1);
  });
});
