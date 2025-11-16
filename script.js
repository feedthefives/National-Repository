
const API_BASE = "https://national-repository.feedthefives.workers.dev/api";
const PAGE_SIZE = 20;

let currentQuery = "";
let currentPage = 1;
let totalResults = 0;

const qs = sel => document.querySelector(sel);
const resultsGrid = qs("#resultsGrid");
const resultsSummary = qs("#resultsSummary");
const yearFilter = qs("#yearFilter");
const institutionFilter = qs("#institutionFilter");
const pageInfo = qs("#pageInfo");
const prevPageBtn = qs("#prevPage");
const nextPageBtn = qs("#nextPage");
const paginationEl = qs("#pagination");
const statusBox = qs("#systemStatus");

function setSummary(text) {
  if (resultsSummary) resultsSummary.textContent = text;
}

// Debounce helper for auto search
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

async function loadFilters() {
  try {
    const res = await fetch(`${API_BASE}/filters`);
    const data = await res.json();

    if (data.years && Array.isArray(data.years)) {
      for (const y of data.years) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearFilter.appendChild(opt);
      }
    }
    if (data.institutions && Array.isArray(data.institutions)) {
      for (const inst of data.institutions) {
        const opt = document.createElement("option");
        opt.value = inst;
        opt.textContent = inst;
        institutionFilter.appendChild(opt);
      }
    }
  } catch (e) {
    console.error("Filter load error", e);
  }
}

async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();

    if (data.ok) {
      const total = data.total_records || 0;
      const repos = data.repositories || 0;
      statusBox.innerHTML = `
        <div><strong>Total records:</strong> ${total.toLocaleString()}</div>
        <div><strong>Repositories:</strong> ${repos}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">
          Updated: ${new Date(data.timestamp).toLocaleString()}
        </div>
      `;
    } else {
      statusBox.textContent = "Status unavailable.";
    }
  } catch (e) {
    console.error("Health error", e);
    statusBox.textContent = "Could not load system status.";
  }
}

function renderLoading() {
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <h3>Searching theses…</h3>
      <p>Please wait while we query the national repositories.</p>
    </div>
  `;
}

function renderEmpty(message) {
  resultsGrid.innerHTML = `
    <div class="empty-state">
      <h3>No theses found</h3>
      <p>${message}</p>
    </div>
  `;
}

function renderError(message) {
  resultsGrid.innerHTML = `
    <div class="error-state">
      <h3>Error loading data</h3>
      <p>${message}</p>
      <p style="font-size:12px;color:#9b1c1c;">Check console for details.</p>
    </div>
  `;
}

function renderResults(records) {
  if (!records || records.length === 0) {
    renderEmpty("Try a different keyword or remove some filters.");
    return;
  }

  resultsGrid.innerHTML = "";

  for (const r of records) {
    const authors = Array.isArray(r.authors) ? r.authors.join(", ") : (r.authors || "");
    const desc = (r.description || "").trim();
    const shortDesc =
      desc.length > 280 ? desc.slice(0, 280).trimEnd() + "…" : desc;

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-top">
        <span class="card-pill">Thesis</span>
        <span class="card-inst">${r.institution || ""}</span>
      </div>
      <h3 class="card-title">${r.title || "Untitled thesis"}</h3>
      ${
        authors
          ? `<div class="card-authors">${authors}</div>`
          : ""
      }
      ${
        shortDesc
          ? `<div class="card-desc">${shortDesc}</div>`
          : ""
      }
      <div class="card-meta-row">
        <div class="card-meta">
          ${r.year ? `Year: ${r.year}` : ""}<br/>
          ${r.identifier ? `Handle: ${r.identifier.replace(/^https?:\/\//, "")}` : ""}
        </div>
        <div class="card-actions">
          ${
            r.url
              ? `<a href="${r.url}" target="_blank" rel="noopener noreferrer">View thesis</a>`
              : ""
          }
        </div>
      </div>
    `;
    resultsGrid.appendChild(card);
  }
}

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

async function performSearch(page = 1) {
  const q = currentQuery.trim();
  const year = yearFilter.value;
  const inst = institutionFilter.value;

  if (!q && !year && !inst) {
    resultsGrid.innerHTML = `
      <div class="empty-state">
        <h3>National theses search</h3>
        <p>Start typing in the search box to search across South African theses and dissertations.</p>
      </div>
    `;
    paginationEl.style.display = "none";
    setSummary("Start typing to search theses…");
    return;
  }

  currentPage = page;
  renderLoading();
  setSummary("Searching national repositories…");

  const params = new URLSearchParams({
    q,
    page: String(currentPage),
    pageSize: String(PAGE_SIZE)
  });
  if (year) params.set("year", year);
  if (inst) params.set("institution", inst);

  try {
    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    totalResults = data.total || 0;

    if (totalResults === 0) {
      renderEmpty("No theses match your search.");
      setSummary("0 results.");
      paginationEl.style.display = "none";
      return;
    }

    renderResults(data.results || []);
    setSummary(
      `${totalResults.toLocaleString()} result${
        totalResults === 1 ? "" : "s"
      } found`
    );
    updatePagination();
  } catch (e) {
    console.error("Search error:", e);
    renderError(e.message || "Unknown error");
    setSummary("An error occurred while searching.");
  }
}

// Debounced version for typing
const debouncedSearch = debounce(() => performSearch(1), 450);

/* Event wiring */

document.addEventListener("DOMContentLoaded", () => {
  loadFilters();
  loadHealth();

  const searchInput = qs("#searchInput");
  const searchBtn = qs("#searchButton");

  if (searchInput) {
    searchInput.addEventListener("input", e => {
      currentQuery = e.target.value || "";
      debouncedSearch();
    });

    searchInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        currentQuery = searchInput.value || "";
        performSearch(1);
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      currentQuery = searchInput.value || "";
      performSearch(1);
    });
  }

  if (yearFilter) {
    yearFilter.addEventListener("change", () => performSearch(1));
  }
  if (institutionFilter) {
    institutionFilter.addEventListener("change", () => performSearch(1));
  }

  const clearBtn = qs("#clearFilters");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      yearFilter.value = "";
      institutionFilter.value = "";
      performSearch(1);
    });
  }

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      performSearch(currentPage - 1);
    }
  });

  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
    if (currentPage < totalPages) {
      performSearch(currentPage + 1);
    }
  });

  // Initial empty state
  renderEmpty("Start typing above to search the national theses repository.");
});
