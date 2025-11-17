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

const pageInfo = $("#pageInfo");
const prevPageBtn = $("#prevPage");
const nextPageBtn = $("#nextPage");
const paginationEl = $("#pagination");

const statusBox = $("#systemStatus");

/* ---------------------------------------------------
   AUTO HARVEST ON LOAD
--------------------------------------------------- */
async function autoHarvestOnLoad() {
  try {
    await fetch(`${API_BASE}/auto-harvest`);
    await loadFilters();
    await loadHealth();
    await loadInitialRecords();
  } catch (e) {
    console.error("Auto-harvest error:", e);
  }
}

/* ---------------------------------------------------
   Load initial cached records (no query)
--------------------------------------------------- */
async function loadInitialRecords() {
  try {
    const res = await fetch(`${API_BASE}/search?page=1&pageSize=${PAGE_SIZE}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      renderEmpty("Start typing to search theses…");
      return;
    }

    resultsPanel.classList.remove("hidden");
    filtersPanel.classList.remove("hidden");

    totalResults = data.total;
    renderResults(data.results);
    updatePagination();
  } catch (e) {
    console.error(e);
    renderError("Failed to load initial data.");
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
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      yearFilter.append(o);
    });

    data.institutions.forEach(inst => {
      const o = document.createElement("option");
      o.value = inst;
      o.textContent = inst;
      institutionFilter.append(o);
    });
  } catch (e) {
    console.error("Filter load error:", e);
  }
}

/* ---------------------------------------------------
   Health status
--------------------------------------------------- */
async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();

    statusBox.innerHTML = `
      <div><strong>Total records:</strong> ${data.total_records}</div>
      <div><strong>Repositories:</strong> ${data.repositories}</div>
      <div style="font-size:11px;color:#6b7280;">Updated: ${new Date(data.timestamp).toLocaleString()}</div>
    `;
  } catch {
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
    const authors = Array.isArray(r.authors) ? r.authors.join(", ") : r.authors || "";

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
            ${r.year ? `Year: ${r.year}` : ""}
            <br>
            Handle: ${r.url.replace(/^https?:\/\//, "")}
          </div>

          <div class="card-actions">
            <a href="${r.url}" target="_blank">View thesis</a>
          </div>
        </div>
      </article>`;
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
      <h3>Error</h3>
      <p>${msg}</p>
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
   Perform search
--------------------------------------------------- */
async function performSearch(page = 1) {
  currentPage = page;

  const q = currentQuery.trim();
  const year = yearFilter.value;
  const inst = institutionFilter.value;

  const params = new URLSearchParams({
    page,
    pageSize: PAGE_SIZE
  });

  if (q) params.set("q", q);
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
    console.error(e);
    renderError("Search failed.");
  }
}

/* ---------------------------------------------------
   Debounce for auto-search typing
--------------------------------------------------- */
function debounce(fn, delay) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedSearch = debounce(() => performSearch(1), 300);

/* ---------------------------------------------------
   Event listeners
--------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  autoHarvestOnLoad();

  const searchInput = $("#searchInput");
  const searchBtn = $("#searchButton");

  searchInput.addEventListener("input", e => {
    currentQuery = e.target.value;
    debouncedSearch();
  });

  searchBtn.addEventListener("click", () => {
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
