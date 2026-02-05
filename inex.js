if (typeof Chart === "undefined") {
  const script = document.createElement("script");
  script.src =
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
  script.onload = initDashboard;
  document.head.appendChild(script);
} else {
  initDashboard();
}

let trendChart, donutChart, activityChart, greenhouseChart, ghTrendChart;
let dashboardData = null;
let viewMode = "stems"; // Default to stems view

function initDashboard() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const fromDateInput = root_element.querySelector("#hd-from-date");
  const toDateInput = root_element.querySelector("#hd-to-date");
  const refreshBtn = root_element.querySelector("#hd-refresh-btn");
  const stemsBtn = root_element.querySelector("#hd-stems-btn");
  const bucketsBtn = root_element.querySelector("#hd-buckets-btn");

  fromDateInput.value = weekAgo;
  toDateInput.value = today;

  // Set initial toggle state (stems is default)
  stemsBtn.classList.add("active");

  // Toggle event listeners
  stemsBtn.addEventListener("click", () => setViewMode("stems"));
  bucketsBtn.addEventListener("click", () => setViewMode("buckets"));

  refreshBtn.addEventListener("click", fetchDashboardData);
  fromDateInput.addEventListener("change", fetchDashboardData);
  toDateInput.addEventListener("change", fetchDashboardData);

  root_element.querySelectorAll(".stat-card[data-type]").forEach((card) => {
    card.addEventListener("click", function () {
      const entryType = this.dataset.type;
      const fromDate = fromDateInput.value;
      const toDate = toDateInput.value;
      frappe.set_route("List", "Stock Entry", {
        stock_entry_type: entryType,
        posting_date: ["between", [fromDate, toDate]],
      });
    });
  });

  // Modal close
  root_element
    .querySelector("#hd-gh-modal-close")
    .addEventListener("click", closeGreenhouseModal);
  root_element
    .querySelector("#hd-gh-modal")
    .addEventListener("click", function (e) {
      if (e.target === this) closeGreenhouseModal();
    });

  fetchDashboardData();
}

function setViewMode(mode) {
  viewMode = mode;
  const stemsBtn = root_element.querySelector("#hd-stems-btn");
  const bucketsBtn = root_element.querySelector("#hd-buckets-btn");

  stemsBtn.classList.toggle("active", mode === "stems");
  bucketsBtn.classList.toggle("active", mode === "buckets");

  if (dashboardData) {
    updateDashboard(dashboardData);
  }
}

function fetchDashboardData() {
  const fromDate = root_element.querySelector("#hd-from-date").value;
  const toDate = root_element.querySelector("#hd-to-date").value;
  const loading = root_element.querySelector("#hd-loading");

  loading.classList.add("active");

  frappe.call({
    method: "upande_harvest.api.get_dashboard_data",
    args: { from_date: fromDate, to_date: toDate },
    callback: function (r) {
      loading.classList.remove("active");
      if (r.message) {
        dashboardData = r.message;
        updateDashboard(r.message);
      }
    },
    error: function () {
      loading.classList.remove("active");
      frappe.msgprint("Failed to load dashboard data");
    },
  });
}

function updateDashboard(data) {
  const isStemView = viewMode === "stems";
  const unit = isStemView ? "stems" : "buckets";

  // Update stat cards based on view mode
  if (isStemView) {
    updateStatCard(
      "harvesting",
      data.quantities.harvesting,
      data.trends.harvesting,
      "stems",
    );
    updateStatCard(
      "receiving",
      data.quantities.receiving,
      data.trends.receiving,
      "stems",
    );
    updateStatCard(
      "grading",
      data.quantities.grading,
      data.trends.grading,
      "stems",
    );
    root_element.querySelector("#hd-total-count").textContent = formatNumber(
      data.total_stems || 0,
    );
    root_element.querySelector("#hd-total-label").textContent = "Total Stems";
  } else {
    updateStatCard(
      "harvesting",
      data.counts.harvesting,
      data.trends.harvesting,
      "buckets",
    );
    updateStatCard(
      "receiving",
      data.counts.receiving,
      data.trends.receiving,
      "buckets",
    );
    updateStatCard(
      "grading",
      data.counts.grading,
      data.trends.grading,
      "buckets",
    );
    root_element.querySelector("#hd-total-count").textContent = formatNumber(
      data.total_entries,
    );
    root_element.querySelector("#hd-total-label").textContent = "Total Buckets";
  }

  updateTrendChart(data.daily_data);
  updateDonutChart(isStemView ? data.quantities : data.counts, unit);
  updateActivityChart(data.hourly_data);
  updateTopItems(data.variety_data || data.top_items, isStemView);
  updateGreenhouseSection(data.greenhouse_data || []);
}

function updateStatCard(type, count, trend, unit) {
  root_element.querySelector(`#hd-${type}-count`).textContent = formatNumber(
    count || 0,
  );
  root_element.querySelector(`#hd-${type}-unit`).textContent = unit;
  const trendEl = root_element.querySelector(`#hd-${type}-trend`);
  const isUp = trend > 0;
  const isDown = trend < 0;
  trendEl.className =
    "stat-trend " + (isUp ? "up" : isDown ? "down" : "neutral");
  trendEl.querySelector(".trend-icon").textContent = isUp
    ? "\u2191"
    : isDown
      ? "\u2193"
      : "\u2192";
  trendEl.querySelector(".trend-value").textContent = Math.abs(trend) + "%";
}

function updateTrendChart(dailyData) {
  const ctx = root_element.querySelector("#hd-trend-chart");
  if (trendChart) trendChart.destroy();

  const gradientGreen = ctx.getContext("2d").createLinearGradient(0, 0, 0, 280);
  gradientGreen.addColorStop(0, "rgba(16, 185, 129, 0.4)");
  gradientGreen.addColorStop(1, "rgba(16, 185, 129, 0)");

  const gradientBlue = ctx.getContext("2d").createLinearGradient(0, 0, 0, 280);
  gradientBlue.addColorStop(0, "rgba(59, 130, 246, 0.4)");
  gradientBlue.addColorStop(1, "rgba(59, 130, 246, 0)");

  const gradientOrange = ctx
    .getContext("2d")
    .createLinearGradient(0, 0, 0, 280);
  gradientOrange.addColorStop(0, "rgba(245, 158, 11, 0.4)");
  gradientOrange.addColorStop(1, "rgba(245, 158, 11, 0)");

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dailyData.labels,
      datasets: [
        {
          label: "Harvesting",
          data: dailyData.datasets.harvesting,
          borderColor: "#10b981",
          backgroundColor: gradientGreen,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: "#10b981",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 8,
        },
        {
          label: "Receiving",
          data: dailyData.datasets.receiving,
          borderColor: "#3b82f6",
          backgroundColor: gradientBlue,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: "#3b82f6",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 8,
        },
        {
          label: "Grading",
          data: dailyData.datasets.grading,
          borderColor: "#f59e0b",
          backgroundColor: gradientOrange,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: "#f59e0b",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          titleFont: { size: 14, weight: "600" },
          bodyFont: { size: 13 },
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: "#9ca3af" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: { font: { size: 11 }, color: "#9ca3af" },
        },
      },
    },
  });

  root_element.querySelector("#hd-trend-legend").innerHTML =
    '<div class="legend-item"><span class="legend-dot" style="background:#10b981"></span>Harvesting</div><div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>Receiving</div><div class="legend-item"><span class="legend-dot" style="background:#f59e0b"></span>Grading</div>';
}

function updateDonutChart(data, unit) {
  const ctx = root_element.querySelector("#hd-donut-chart");
  const total =
    (data.harvesting || 0) + (data.receiving || 0) + (data.grading || 0);
  root_element.querySelector("#hd-donut-total").textContent =
    formatNumber(total);
  root_element.querySelector("#hd-donut-label").textContent =
    unit === "stems" ? "Stems" : "Buckets";
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Harvesting", "Receiving", "Grading"],
      datasets: [
        {
          data: [data.harvesting || 0, data.receiving || 0, data.grading || 0],
          backgroundColor: [
            "rgba(16, 185, 129, 0.85)",
            "rgba(59, 130, 246, 0.85)",
            "rgba(245, 158, 11, 0.85)",
          ],
          borderColor: ["#10b981", "#3b82f6", "#f59e0b"],
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function (context) {
              const value = context.raw;
              const percentage =
                total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return (
                context.label +
                ": " +
                formatNumber(value) +
                " " +
                unit +
                " (" +
                percentage +
                "%)"
              );
            },
          },
        },
      },
    },
  });

  const pctH = total > 0 ? ((data.harvesting / total) * 100).toFixed(0) : 0;
  const pctR = total > 0 ? ((data.receiving / total) * 100).toFixed(0) : 0;
  const pctG = total > 0 ? ((data.grading / total) * 100).toFixed(0) : 0;
  root_element.querySelector("#hd-donut-legend").innerHTML =
    '<div class="legend-item"><span class="legend-dot" style="background:#10b981"></span>Harvesting ' +
    pctH +
    '%</div><div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>Receiving ' +
    pctR +
    '%</div><div class="legend-item"><span class="legend-dot" style="background:#f59e0b"></span>Grading ' +
    pctG +
    "%</div>";
}

function updateActivityChart(hourlyData) {
  const ctx = root_element.querySelector("#hd-activity-chart");
  if (activityChart) activityChart.destroy();

  activityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: hourlyData.labels,
      datasets: [
        {
          label: "Harvesting",
          data: hourlyData.harvesting,
          backgroundColor: "rgba(16, 185, 129, 0.8)",
          borderRadius: 4,
        },
        {
          label: "Receiving",
          data: hourlyData.receiving,
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          borderRadius: 4,
        },
        {
          label: "Grading",
          data: hourlyData.grading,
          backgroundColor: "rgba(245, 158, 11, 0.8)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 10 }, color: "#9ca3af" },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: { font: { size: 11 }, color: "#9ca3af" },
        },
      },
    },
  });
}

function updateTopItems(items, isStemView) {
  const container = root_element.querySelector("#hd-top-items");
  const subtitle = root_element.querySelector("#hd-top-items-subtitle");
  subtitle.textContent = isStemView ? "By stems harvested" : "By bucket count";

  if (!items || items.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No varieties processed in this period</div>';
    return;
  }
  container.innerHTML = items
    .map(function (item, index) {
      const rankClass =
        index === 0
          ? "gold"
          : index === 1
            ? "silver"
            : index === 2
              ? "bronze"
              : "";
      const qty = isStemView ? item.total_stems : item.bucket_count;
      const meta = isStemView
        ? (item.bucket_count || item.entry_count || 0) + " buckets"
        : formatNumber(item.total_stems || item.total_qty || 0) + " stems";
      return (
        '<div class="item-row"><div class="item-rank ' +
        rankClass +
        '">' +
        (index + 1) +
        '</div><div class="item-info"><div class="item-name">' +
        (item.item_name || item.item_code) +
        '</div><div class="item-meta">' +
        meta +
        '</div></div><div class="item-qty">' +
        formatNumber(qty || 0) +
        "</div></div>"
      );
    })
    .join("");
}

function updateGreenhouseSection(greenhouseData) {
  const container = root_element.querySelector("#hd-greenhouse-cards");

  if (!greenhouseData || greenhouseData.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No greenhouse data available</div>';
    updateGreenhouseChart([]);
    return;
  }

  // Update greenhouse cards
  container.innerHTML = greenhouseData
    .map(function (gh) {
      const name = gh.greenhouse_name || gh.greenhouse || "Unknown";
      return (
        '<div class="gh-card" data-greenhouse="' +
        gh.greenhouse +
        '"><div class="gh-card-header"><span class="gh-name">' +
        name +
        '</span><span class="gh-arrow">\u2192</span></div><div class="gh-card-stats"><div class="gh-stat"><span class="gh-stat-value">' +
        formatNumber(gh.total_stems || 0) +
        '</span><span class="gh-stat-label">stems</span></div><div class="gh-stat"><span class="gh-stat-value">' +
        (gh.entry_count || 0) +
        '</span><span class="gh-stat-label">buckets</span></div><div class="gh-stat"><span class="gh-stat-value">' +
        (gh.variety_count || 0) +
        '</span><span class="gh-stat-label">varieties</span></div><div class="gh-stat"><span class="gh-stat-value">' +
        (gh.harvester_count || 0) +
        '</span><span class="gh-stat-label">harvesters</span></div></div></div>'
      );
    })
    .join("");

  // Add click handlers for greenhouse cards
  container.querySelectorAll(".gh-card").forEach(function (card) {
    card.addEventListener("click", function () {
      const greenhouse = this.dataset.greenhouse;
      openGreenhouseModal(greenhouse);
    });
  });

  updateGreenhouseChart(greenhouseData);
}

function updateGreenhouseChart(greenhouseData) {
  const ctx = root_element.querySelector("#hd-greenhouse-chart");
  if (greenhouseChart) greenhouseChart.destroy();

  if (!greenhouseData || greenhouseData.length === 0) {
    return;
  }

  const colors = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
  ];

  greenhouseChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: greenhouseData.map(function (gh) {
        return gh.greenhouse_name || gh.greenhouse || "Unknown";
      }),
      datasets: [
        {
          label: "Stems",
          data: greenhouseData.map(function (gh) {
            return gh.total_stems || 0;
          }),
          backgroundColor: greenhouseData.map(function (_, i) {
            return colors[i % colors.length] + "cc";
          }),
          borderColor: greenhouseData.map(function (_, i) {
            return colors[i % colors.length];
          }),
          borderWidth: 2,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function (context) {
              return formatNumber(context.raw) + " stems";
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: { font: { size: 11 }, color: "#9ca3af" },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: "#9ca3af" },
        },
      },
      onClick: function (e, elements) {
        if (elements.length > 0) {
          const index = elements[0].index;
          const greenhouse = greenhouseData[index].greenhouse;
          openGreenhouseModal(greenhouse);
        }
      },
    },
  });
}

function openGreenhouseModal(greenhouse) {
  const modal = root_element.querySelector("#hd-gh-modal");
  const title = root_element.querySelector("#hd-gh-modal-title");
  const fromDate = root_element.querySelector("#hd-from-date").value;
  const toDate = root_element.querySelector("#hd-to-date").value;

  title.textContent = "Loading...";
  modal.classList.add("active");

  frappe.call({
    method: "upande_harvest.api.get_greenhouse_details",
    args: { greenhouse: greenhouse, from_date: fromDate, to_date: toDate },
    callback: function (r) {
      if (r.message) {
        renderGreenhouseDetails(greenhouse, r.message);
      }
    },
    error: function () {
      title.textContent = "Error loading details";
    },
  });
}

function renderGreenhouseDetails(greenhouse, data) {
  const title = root_element.querySelector("#hd-gh-modal-title");
  const varietiesEl = root_element.querySelector("#hd-gh-varieties");
  const harvestersEl = root_element.querySelector("#hd-gh-harvesters");

  // Find greenhouse name from dashboardData
  let ghName = greenhouse;
  if (dashboardData && dashboardData.greenhouse_data) {
    const gh = dashboardData.greenhouse_data.find(function (g) {
      return g.greenhouse === greenhouse;
    });
    if (gh) ghName = gh.greenhouse_name || greenhouse;
  }
  title.textContent = ghName + " Details";

  // Render varieties
  if (data.varieties && data.varieties.length > 0) {
    varietiesEl.innerHTML =
      '<div class="detail-list">' +
      data.varieties
        .map(function (v) {
          return (
            '<div class="detail-row"><span class="detail-name">' +
            (v.item_name || v.item_code) +
            '</span><span class="detail-value">' +
            formatNumber(v.total_stems) +
            " stems</span></div>"
          );
        })
        .join("") +
      "</div>";
  } else {
    varietiesEl.innerHTML = '<div class="empty-state">No varieties</div>';
  }

  // Render harvesters
  if (data.harvesters && data.harvesters.length > 0) {
    harvestersEl.innerHTML =
      '<div class="detail-list">' +
      data.harvesters
        .map(function (h) {
          return (
            '<div class="detail-row"><span class="detail-name">' +
            (h.employee_name || h.harvester || "Unknown") +
            '</span><span class="detail-value">' +
            formatNumber(h.total_stems) +
            " stems</span></div>"
          );
        })
        .join("") +
      "</div>";
  } else {
    harvestersEl.innerHTML = '<div class="empty-state">No harvesters</div>';
  }

  // Render trend chart
  renderGhTrendChart(data.daily_trend || []);
}

function renderGhTrendChart(dailyTrend) {
  const ctx = root_element.querySelector("#hd-gh-trend-chart");
  if (ghTrendChart) {
    ghTrendChart.destroy();
    ghTrendChart = null;
  }

  if (!dailyTrend || dailyTrend.length === 0) {
    ctx.style.display = "none";
    return;
  }

  ctx.style.display = "block";

  // Force canvas dimensions
  ctx.width = ctx.parentElement.offsetWidth;
  ctx.height = 200;

  ghTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dailyTrend.map(function (d) {
        return d.date;
      }),
      datasets: [
        {
          label: "Stems",
          data: dailyTrend.map(function (d) {
            return d.total_stems || 0;
          }),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: "#9ca3af" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { font: { size: 10 }, color: "#9ca3af" },
        },
      },
    },
  });
}

function closeGreenhouseModal() {
  root_element.querySelector("#hd-gh-modal").classList.remove("active");
}

function formatNumber(num) {
  if (num === null || num === undefined) return "0";
  num = Number(num);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
