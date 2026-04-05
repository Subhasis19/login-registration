// admin-panel.js
// Handles loading users, add/edit/delete from Admin Panel
// Requires: dashboard.js shows #adminPanelView and has a button #addUserBtn


const INWARD_SCHEMA = [
  "date_of_receipt",
  "inward_no",
  "month",
  "year",
  "received_in",
  "name_of_sender",
  "address_of_sender",
  "sender_city",
  "sender_state",
  "sender_pin",
  "sender_region",
  "sender_org_type",
  "type_of_document",
  "language_of_document",
  "count",
  "remarks",
  "issued_to",
  "reply_required"
];

const OUTWARD_SCHEMA = [
  "date_of_despatch",
  "outward_no",
  "month",
  "year",
  "reply_from",
  "name_of_receiver",
  "address_of_receiver",
  "receiver_city",
  "receiver_state",
  "receiver_pin",
  "receiver_region",
  "receiver_org_type",
  "type_of_document",
  "language_of_document",
  "count",
  "inward_no",
  "inward_s_no",
  "reply_issued_by",
  "reply_sent_date",
  "reply_ref_no",
  "reply_sent_by",
  "reply_sent_in",
  "reply_count"
];

// ===============================
// COMMON IMPORT RESULT UI
// ===============================
function renderImportResultUI({
  containerId,
  title,
  data,
  type
}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const invalidLanguage = data.skippedRows?.filter(r =>
    r.reason.includes("Language")
  ).length || 0;

  const invalidReply = data.skippedRows?.filter(r =>
    r.reason.includes("Reply")
  ).length || 0;

  let html = `
    <div style="
      border:1px solid #ddd;
      border-radius:6px;
      padding:15px;
      background:#fafafa;
    ">
    <h4>${title}</h4>

    <p>
      <strong>Inserted:</strong> ${data.inserted ?? 0} <br>
      <strong>Skipped:</strong> ${data.skipped ?? 0} <br>
      <strong>Duplicate in Database:</strong> ${data.dbDuplicates?.length ?? 0} <br>
      <strong>Duplicate inside Excel:</strong> ${data.excelDuplicates?.length ?? 0} <br>
      <strong>Invalid Language:</strong> ${invalidLanguage} <br>
      ${type === "inward" ? `<strong>Invalid Reply Required:</strong> ${invalidReply}` : ""}
    </p>
  `;

  if (data.skippedRows?.length) {
    html += `
      <h5>Skipped Rows</h5>

      <div style="max-height:300px; overflow:auto; border:1px solid #ddd;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead style="background:#f0f0f0; position:sticky; top:0;">
        <tr>
          <th style="padding:6px;border:1px solid #ddd;">Row</th>
          <th style="padding:6px;border:1px solid #ddd;">
            ${type === "inward" ? "Inward No" : "Outward No"}
          </th>
          <th style="padding:6px;border:1px solid #ddd;">Reason</th>
        </tr>
      </thead>
      <tbody>
    `;

    data.skippedRows.forEach(r => {
      html += `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;">${r.row}</td>
          <td style="padding:6px;border:1px solid #ddd;">
            ${type === "inward" ? r.inward_no : r.outward_no}
          </td>
          <td style="padding:6px;border:1px solid #ddd;">${r.reason}</td>
        </tr>
      `;
    });

    html += `
      </tbody>
      </table>
      </div>
    `;
  }

  html += `</div>`;

  container.innerHTML = html;
}

function highlightPreviewRows({
  containerSelector,
  schema,
  skippedRows,
  type
}) {
  if (!skippedRows?.length) return;

  const table = document.querySelector(containerSelector + " table");
  if (!table) return;

  const rows = table.querySelectorAll("tbody tr");

  skippedRows.forEach(error => {

    const rowIndex = error.row - 2;
    const tr = rows[rowIndex];
    if (!tr) return;

    const cells = tr.querySelectorAll("td");

    if (error.reason.includes("Excel")) {
      tr.style.background = "#fcb761";
    }

    if (error.reason.includes("database")) {
      tr.style.background = "#fa9ca3";
    }

    if (error.reason.includes("Language")) {
      const colIndex = schema.indexOf("language_of_document");
      if (cells[colIndex]) {
        cells[colIndex].style.background = "#fef3c7";
      }
    }

    if (type === "inward" && error.reason.includes("Reply")) {
      const colIndex = schema.indexOf("reply_required");
      if (cells[colIndex]) {
        cells[colIndex].style.background = "#fef3c7";
      }
    }

  });
}

function countRealErrors(skippedRows) {
  return skippedRows?.filter(r =>
    r.reason.includes("Invalid")
  ).length || 0;
}





function validateExcelSchema(rows) {

  if (!rows || !rows.length) return [];

  const firstRowKeys = Object.keys(rows[0]).map(k => k.trim());

  const missingColumns = INWARD_SCHEMA.filter(col =>
    !firstRowKeys.includes(col)
  );

  return missingColumns;

}

function validateOutwardExcelSchema(rows) {

  if (!rows || !rows.length) return [];

  const firstRowKeys = Object.keys(rows[0]).map(k => k.trim());

  const missingColumns = OUTWARD_SCHEMA.filter(col =>
    !firstRowKeys.includes(col)
  );

  return missingColumns;
}

(async function () {
  // Utility: create element from HTML string
  function createEl(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    return tmp.firstChild;
  }

  // Show simple toast via alert for now
  function showMsg(msg) {
    alert(msg);
  }

  // Fetch users from backend
  async function loadUsers() {
    const tbody = document.querySelector("#usersTable tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Loading users…</td></tr>`;

    try {
      const res = await fetch("/admin/users", { credentials: "same-origin" });
      if (!res.ok) {
        if (res.status === 403) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Access denied</td></tr>`;
        } else {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Failed to load</td></tr>`;
        }
        return;
      }

      const rows = await res.json();
      renderUsersTable(rows);
    } catch (err) {
      console.error("loadUsers:", err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Error loading users</td></tr>`;
    }
  }

  // Render table body
  function renderUsersTable(users) {
    const tbody = document.querySelector("#usersTable tbody");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">No users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users
      .map(
        (u) => `
      <tr data-id="${u.id}">
        <td>${escapeHtml(u.name || "")}</td>
        <td>${escapeHtml(u.email || "")}</td>
        <td>${escapeHtml(u.mobile || "")}</td>
        <td>${escapeHtml(u.group_name || "")}</td>
        <td>
          <button class="action-btn action-edit" data-action="edit" data-id="${u.id
          }">Edit</button>
          <button class="action-btn action-delete" data-action="delete" data-id="${u.id
          }">Delete</button>
        </td>
      </tr>
    `
      )
      .join("");
  }


  // Open modal for Add or Edit
  function openUserModal({ mode = "add", user = {} } = {}) {
    // modal markup
    const modal = createEl(`
      <div class="admin-modal-overlay" style="
          position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,0.4); z-index:9999;">
        <div class="admin-modal" style="
            width:520px; max-width:94%; background:#fff; border-radius:10px; padding:18px;
            box-shadow:0 8px 24px rgba(0,0,0,0.12);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">${mode === "add" ? "Add User" : "Edit User"
      }</h3>
            <button id="modalClose" style="border:none;background:transparent; font-size:18px; cursor:pointer;">✕</button>
          </div>

          <form id="adminUserForm">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:13px;">Name*</label>
                <input name="name" value="${escapeAttr(
        user.name || ""
      )}" required style="width:100%; padding:8px; margin-top:6px;"/>
              </div>
              <div>
                <label style="font-size:13px;">Email*</label>
                <input name="email" value="${escapeAttr(
        user.email || ""
      )}" type="email" required style="width:100%; padding:8px; margin-top:6px;"/>
              </div>

              <div>
                <label style="font-size:13px;">Mobile</label>
                <input name="mobile" value="${escapeAttr(
        user.mobile || ""
      )}" style="width:100%; padding:8px; margin-top:6px;"/>
              </div>

              

              <div style="grid-column: 1 / -1;">
  <label style="font-size:13px;">Group*</label>
  <select name="group_name" required style="width:100%; padding:8px; margin-top:6px;">
      <option value="">Select Group</option>
      <option value="Admin" ${user.group_name === "Admin" ? "selected" : ""}>Admin</option>
      <option value="HR" ${user.group_name === "HR" ? "selected" : ""}>HR</option>
      <option value="Finance" ${user.group_name === "Finance" ? "selected" : ""}>Finance</option>
      <option value="SWT" ${user.group_name === "SWT" ? "selected" : ""}>SWT</option>
      <option value="HWT" ${user.group_name === "HWT" ? "selected" : ""}>HWT</option>
      <option value="ISS" ${user.group_name === "ISS" ? "selected" : ""}>ISS</option>
      <option value="CH Office" ${user.group_name === "CH Office" ? "selected" : ""}>CH Office</option>
      <option value="MIS" ${user.group_name === "MIS" ? "selected" : ""}>MIS</option>
      <option value="PMU" ${user.group_name === "PMU" ? "selected" : ""}>PMU</option>
      <option value="E&T" ${user.group_name === "E&T" ? "selected" : ""}>E&T</option>
      <option value="NetOps" ${user.group_name === "NetOps" ? "selected" : ""}>NetOps</option>
      <option value="MMG" ${user.group_name === "MMG" ? "selected" : ""}>MMG</option>
  </select>
</div>


              ${mode === "add"
        ? `
                <div style="grid-column: 1 / -1;">
                  <label style="font-size:13px;">Temporary Password*</label>
                  <input name="password" type="password" required style="width:100%; padding:8px; margin-top:6px;" placeholder="Set temporary password" />
                  <p style="font-size:12px; color:#666; margin-top:6px;">User can change password after first login.</p>
                </div>
              `
        : ""
      }
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button type="button" id="cancelBtn" style="padding:8px 12px; border-radius:6px; border:1px solid #ddd; background:#fff; cursor:pointer;">Cancel</button>
              <button type="submit" id="saveBtn" style="padding:8px 12px; background:var(--primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                ${mode === "add" ? "Create User" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    `);

    document.body.appendChild(modal);

    // helpers
    const overlay = modal;
    const form = modal.querySelector("#adminUserForm");
    const cancelBtn = modal.querySelector("#cancelBtn");
    const closeBtn = modal.querySelector("#modalClose");

    function closeModal() {
      overlay.remove();
    }

    cancelBtn.addEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeModal();
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();

      const fd = new FormData(form);
      const payload = {
        name: (fd.get("name") || "").trim(),
        email: (fd.get("email") || "").trim(),
        mobile: (fd.get("mobile") || "").trim(),
        group_name: (fd.get("group_name") || "").trim(),
      };

      try {
        if (mode === "add") {
          const password = (fd.get("password") || "").trim();
          if (!password) return showMsg("Password required");
          payload.password = password;

          const res = await fetch("/admin/users/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
          });

          const j = await res.json().catch(() => null);
          if (!res.ok) {
            showMsg((j && j.message) || "Failed to create user");
            return;
          }

          showMsg("User created");
          closeModal();
          loadUsers();
          return;
        } else {
          // edit
          const res = await fetch(`/admin/users/update/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
          });

          const j = await res.json().catch(() => null);
          if (!res.ok) {
            showMsg((j && j.message) || "Failed to update user");
            return;
          }

          showMsg("User updated");
          closeModal();
          loadUsers();
        }
      } catch (err) {
        console.error("user modal submit:", err);
        showMsg("Network error");
      }
    });
  }

  // Escape attr values in inputs
  function escapeAttr(s) {
    return String(s || "")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Delete user action (with confirmation)
  async function deleteUser(id) {
    if (!confirm("Delete this user? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/admin/users/delete/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showMsg((j && j.message) || "Failed to delete user");
        return;
      }
      showMsg("User deleted");
      loadUsers();
    } catch (err) {
      console.error("deleteUser:", err);
      showMsg("Network error");
    }
  }

  // Click delegation for edit/delete buttons
  function attachTableHandlers() {
    const table = document.getElementById("usersTable");
    if (!table) return;

    table.removeEventListener("click", table._adminClickHandler);
    const handler = (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === "edit") {
        // fetch user's current row data from DOM or reload from server if needed
        const tr = btn.closest("tr");
        const user = {
          id: Number(id),
          name: tr.children[0].textContent.trim(),
          email: tr.children[1].textContent.trim(),
          mobile: tr.children[2].textContent.trim(),
          group_name: tr.children[3].textContent.trim(),
        };
        openUserModal({ mode: "edit", user });
        return;
      }

      if (action === "delete") {
        // prevent deleting self via UI: get current session id by trying to read from #adminName? server also prevents
        const currentUserId = window.__CURRENT_USER_ID || null;
        if (Number(id) === Number(currentUserId)) {
          showMsg("You cannot delete your own account");
          return;
        }
        deleteUser(id);
        return;
      }
    };

    table.addEventListener("click", handler);
    table._adminClickHandler = handler;
  }

  // Hook Add User button
  function initAddUserBtn() {
    const btn = document.getElementById("addUserBtn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openUserModal({ mode: "add" });
    });
  }

  // Try to fetch session-info to store current user id for UI-level protection
  async function fetchCurrentUserId() {
    try {
      const res = await fetch("/session-info", { credentials: "same-origin" });
      if (!res.ok) return;
      const j = await res.json();
      if (j && j.user && j.user.id) {
        window.__CURRENT_USER_ID = j.user.id;
      }
    } catch (err) {
      // ignore
    }
  }

  // Public function connecting points: called by dashboard.js when admin panel opens
  window.__adminPanelLoadUsers = function () {
    loadUsers();
    loadNotingsAdmin();
  };
  // Init
  document.addEventListener("DOMContentLoaded", () => {
    initAddUserBtn();
    attachTableHandlers();
    fetchCurrentUserId();
    // If admin-panel already visible on load, load users
    if (document.getElementById("adminPanelView")?.style.display !== "none") {
      loadUsers();
    }

    const searchBtn = document.getElementById("adminInwardSearchBtn");
    const searchInput = document.getElementById("adminInwardSearchInput");

    if (searchBtn && searchInput) {

      searchBtn.addEventListener("click", () => {
        searchAdminInwards(searchInput.value.trim());
      });

      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          searchAdminInwards(searchInput.value.trim());
        }
      });

    }

    const outwardSearchBtn = document.getElementById("adminOutwardSearchBtn");
    const outwardSearchInput = document.getElementById("adminOutwardSearchInput");

    if (outwardSearchBtn && outwardSearchInput) {

      outwardSearchBtn.addEventListener("click", () => {
        searchAdminOutwards(outwardSearchInput.value.trim());
      });

      outwardSearchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          searchAdminOutwards(outwardSearchInput.value.trim());
        }
      });

    }
    document.getElementById("adminNotingsFilterBtn")?.addEventListener("click", () => {
      loadNotingsAdmin();
    });

  });

  // Also try to automatically attach a click observer in case admin view is shown later
  // (Dashboard will call window.__adminPanelLoadUsers when it shows admin view)
})();


// ===============================
// ADMIN EDIT BUTTON HANDLER
// ===============================
document.addEventListener("click", function (e) {

  // Edit inward
  const inwardBtn = e.target.closest(".edit-inward-btn");
  if (inwardBtn) {
    const id = inwardBtn.dataset.id;
    const frame = document.getElementById("formFrame");
    frame.src = `/inward?id=${id}`;

    document.getElementById("iframeContainer").style.display = "block";

    document.getElementById("dashboardView").style.display = "none";
    document.getElementById("adminPanelView").style.display = "none";
    document.getElementById("notingsView").style.display = "none";
    document.getElementById("emailsView").style.display = "none";
    return;
  }

  // Edit outward
  const outwardBtn = e.target.closest(".edit-outward-btn");
  if (outwardBtn) {
    const id = outwardBtn.dataset.id;
    const frame = document.getElementById("formFrame");
    frame.src = `/outward?id=${id}`;

    document.getElementById("iframeContainer").style.display = "block";

    document.getElementById("dashboardView").style.display = "none";
    document.getElementById("adminPanelView").style.display = "none";
    document.getElementById("notingsView").style.display = "none";
    document.getElementById("emailsView").style.display = "none";
    return;
  }

  
  // NOTINGS EDIT
  const notingBtn = e.target.closest(".edit-noting-btn");
  if (notingBtn) {
    const id = notingBtn.dataset.id;
    window.location.href = `/dashboard.html?page=notings&id=${id}`;
    return;
  }


});

/* ===============================
   ADMIN SEARCH INWARD
================================ */
async function searchAdminInwards(query) {
  const tbody = document.querySelector("#adminInwardTable tbody");

  if (!query) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:20px; color:#999;">
          Please enter an Inward No.
        </td>
      </tr>`;
    return;
  }

  try {
    const res = await fetch(`/admin/inward/search?q=${encodeURIComponent(query)}`, {
      credentials: "same-origin"
    });

    const rows = await res.json();

    if (!rows || !rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:20px; color:#999;">
            No matching records found.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.inward_no}</td>
        <td>${r.date_of_receipt.split("T")[0]}</td>
        <td>${r.received_in}</td>
        <td>
          <button class="btn-small edit-inward-btn" data-id="${r.s_no}">
            Edit
          </button>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Search error:", err);
  }
}

/* ===============================
   ADMIN SEARCH OUTWARD
================================ */
async function searchAdminOutwards(query) {
  const tbody = document.querySelector("#adminOutwardTable tbody");

  if (!query) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:20px; color:#999;">
          Please enter an Outward No.
        </td>
      </tr>`;
    return;
  }

  try {
    const res = await fetch(`/admin/outward/search?q=${encodeURIComponent(query)}`, {
      credentials: "same-origin"
    });

    const rows = await res.json();

    if (!rows || !rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:20px; color:#999;">
            No matching records found.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.outward_no}</td>
        <td>${r.date_of_despatch.split("T")[0]}</td>
        <td>${r.reply_from}</td>
        <td>
          <button class="btn-small edit-outward-btn" data-id="${r.s_no}">
            Edit
          </button>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Search error:", err);
  }
}

/* ==================================================
   ADMIN PANEL — AUTOCOMPLETE SEARCH (INWARD)
================================================== */

window.addEventListener("DOMContentLoaded", () => {

  const inwardInput = document.getElementById("adminInwardSearchInput");
  if (!inwardInput) return;

  const suggestBox = document.createElement("div");
  suggestBox.className = "suggest-box";
  suggestBox.style.position = "absolute";
  suggestBox.style.top = inwardInput.offsetHeight + 6 + "px";
  suggestBox.style.left = "0px";
  suggestBox.style.width = Math.max(inwardInput.offsetWidth, 320) + "px";
  suggestBox.style.background = "#fff";
  suggestBox.style.border = "1px solid rgba(20,30,60,0.08)";
  suggestBox.style.borderRadius = "8px";
  suggestBox.style.boxShadow = "0 8px 24px rgba(20,30,60,0.08)";
  suggestBox.style.maxHeight = "260px";
  suggestBox.style.overflowY = "auto";
  suggestBox.style.display = "none";
  suggestBox.style.zIndex = "9999";
  suggestBox.style.padding = "6px";

  inwardInput.parentElement.style.position = "relative";
  inwardInput.parentElement.appendChild(suggestBox);

  let timeout = null;

  inwardInput.addEventListener("input", () => {
    const q = inwardInput.value.trim();

    if (!q) {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      return;
    }

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fetchResults(q), 220);
  });

  async function fetchResults(q) {

    const res = await fetch(`/admin/inward/search?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin"
    });

    const rows = await res.json();

    suggestBox.innerHTML = "";

    if (!rows || !rows.length) {

      const noRes = document.createElement("div");
      noRes.style.padding = "12px";
      noRes.style.textAlign = "center";
      noRes.style.color = "#666";
      noRes.textContent = "No results found";

      suggestBox.appendChild(noRes);
      suggestBox.style.display = "block";
      return;
    }

    rows.forEach(r => {

      const item = document.createElement("div");
      item.className = "suggest-item";

      item.style.padding = "10px";
      item.style.cursor = "pointer";
      item.style.borderRadius = "6px";
      item.style.marginBottom = "6px";

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <div>
            <div style="font-weight:600;color:#0b3b66;">${r.inward_no}</div>
            <div style="font-size:13px;color:#334155;">
              ${escapeHtml(r.name_of_sender || "")}
              ${r.sender_city ? ` — ${escapeHtml(r.sender_city)}` : ""}
            </div>
          </div>
          <div style="text-align:right;font-size:12px;color:#6b7280;">
            ${formatDateShort(r.date_of_receipt)}
            <div style="margin-top:6px;font-weight:600;color:#0b3b66;">
              ${r.received_in || ""}
            </div>
          </div>
        </div>
      `;

      item.addEventListener("mouseenter", () => item.style.background = "#f6f9ff");
      item.addEventListener("mouseleave", () => item.style.background = "transparent");

      item.addEventListener("click", () => {

        inwardInput.value = r.inward_no;
        suggestBox.style.display = "none";

        searchAdminInwards(r.inward_no);

      });

      suggestBox.appendChild(item);

    });

    suggestBox.style.display = "block";
  }

  document.addEventListener("click", e => {
    if (!suggestBox.contains(e.target) && e.target !== inwardInput) {
      suggestBox.style.display = "none";
    }
  });

});

function formatDateShort(d) {
  if (!d) return "";
  const parts = String(d).split("T")[0].split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ==================================================
   ADMIN PANEL — AUTOCOMPLETE SEARCH (OUTWARD)
================================================== */

window.addEventListener("DOMContentLoaded", () => {

  const outwardInput = document.getElementById("adminOutwardSearchInput");
  if (!outwardInput) return;

  const suggestBox = document.createElement("div");

  suggestBox.className = "suggest-box";
  suggestBox.style.position = "absolute";
  suggestBox.style.top = outwardInput.offsetHeight + 6 + "px";
  suggestBox.style.left = "0px";
  suggestBox.style.width = Math.max(outwardInput.offsetWidth, 320) + "px";
  suggestBox.style.background = "#fff";
  suggestBox.style.border = "1px solid rgba(20,30,60,0.08)";
  suggestBox.style.borderRadius = "8px";
  suggestBox.style.boxShadow = "0 8px 24px rgba(20,30,60,0.08)";
  suggestBox.style.maxHeight = "260px";
  suggestBox.style.overflowY = "auto";
  suggestBox.style.display = "none";
  suggestBox.style.zIndex = "9999";
  suggestBox.style.padding = "6px";

  outwardInput.parentElement.style.position = "relative";
  outwardInput.parentElement.appendChild(suggestBox);

  let timeout = null;

  outwardInput.addEventListener("input", () => {

    const q = outwardInput.value.trim();

    if (!q) {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      return;
    }

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fetchResults(q), 220);

  });

  async function fetchResults(q) {

    const res = await fetch(`/admin/outward/search?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin"
    });

    const rows = await res.json();

    suggestBox.innerHTML = "";

    if (!rows || !rows.length) {

      const noRes = document.createElement("div");
      noRes.style.padding = "12px";
      noRes.style.textAlign = "center";
      noRes.style.color = "#666";
      noRes.textContent = "No results found";

      suggestBox.appendChild(noRes);
      suggestBox.style.display = "block";
      return;

    }

    rows.forEach(r => {

      const item = document.createElement("div");

      item.className = "suggest-item";
      item.style.padding = "10px";
      item.style.cursor = "pointer";
      item.style.borderRadius = "6px";
      item.style.marginBottom = "6px";

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <div>
            <div style="font-weight:600;color:#0b3b66;">${r.outward_no}</div>
            <div style="font-size:13px;color:#334155;">
              ${escapeHtml(r.name_of_receiver || "")}
              ${r.receiver_city ? ` — ${escapeHtml(r.receiver_city)}` : ""}
            </div>
          </div>

          <div style="text-align:right;font-size:12px;color:#6b7280;">
            ${formatDateShort(r.date_of_despatch)}
            <div style="margin-top:6px;font-weight:600;color:#0b3b66;">
              ${r.reply_from || ""}
            </div>
          </div>
        </div>
      `;

      item.addEventListener("mouseenter", () => item.style.background = "#f6f9ff");
      item.addEventListener("mouseleave", () => item.style.background = "transparent");

      item.addEventListener("click", () => {

        outwardInput.value = r.outward_no;
        suggestBox.style.display = "none";

        searchAdminOutwards(r.outward_no);

      });

      suggestBox.appendChild(item);

    });

    suggestBox.style.display = "block";

  }

  document.addEventListener("click", (e) => {

    if (!suggestBox.contains(e.target) && e.target !== outwardInput) {
      suggestBox.style.display = "none";
    }

  });

});

document.addEventListener("DOMContentLoaded", () => {

  const inwardBtn = document.getElementById("uploadInwardExcelBtn");
  if (inwardBtn) inwardBtn.addEventListener("click", uploadInwardExcel);

  const outwardBtn = document.getElementById("uploadOutwardExcelBtn");
  if (outwardBtn) outwardBtn.addEventListener("click", uploadOutwardExcel);

});

async function uploadInwardExcel() {

  const fileInput = document.getElementById("inwardExcelFile");

  if (!fileInput.files.length) {
    alert("Please select an Excel file");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  const res = await fetch("/admin/import-inward-upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  });


  if (!res.ok) {
    alert("Upload request failed");
    return;
  }

  const data = await res.json();

  if (!data.success) {
    alert(data.message || "Upload failed");
    return;
  }

  const missingColumns = validateExcelSchema(data.preview);

  if (missingColumns.length) {

    alert(
      "Excel format incorrect.\n\nMissing columns:\n\n" +
      missingColumns.join("\n")
    );

    return;
  }

  renderExcelPreview(data.preview, data.totalRows, data.file);

}


function renderExcelPreview(rows, totalRows, fileName) {

  const container = document.getElementById("excelPreviewContainer");

  if (!rows || rows.length === 0) {
    container.innerHTML = "<p>No data found</p>";
    return;
  }

  const columns = INWARD_SCHEMA;

  let table = `
  <h4>Preview (${totalRows} rows in file)</h4>

    <div style="margin-bottom:8px;font-size:13px;">
    <span style="background:#fa9ca3;padding:3px 8px;border-radius:4px;margin-left:8px;">Duplicate in Database</span>
    <span style="background:#fcb761;padding:3px 8px;border-radius:4px;">Duplicate in Excel</span>
    <span style="background:#fef3c7;padding:3px 8px;border-radius:4px;">Invalid Language</span>
    <span style="background:#fef3c7;padding:3px 8px;border-radius:4px;">Invalid Reply Required</span>
    
    </div>
  <div style="max-height:500px; overflow:auto; border:1px solid #ddd;">

  <table border="1" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:13px;">
  <thead style="position:sticky; top:0; background:#f8fafc; z-index:2;">
  <tr>
  ${columns.map(c => `<th style="position:sticky; top:0; background:#f8fafc;">${c}</th>`).join("")}
  </tr>
  </thead>
  <tbody>
  `;

  rows.forEach(row => {

    table += "<tr>";

    columns.forEach(col => {
      table += `<td>${row[col] ?? ""}</td>`;
    });

    table += "</tr>";

  });

  table += `
  </tbody>
  </table>
  </div>

 <div style="margin-top:12px; display:flex; gap:10px;">

  <button id="validateImportBtn"
  style="padding:8px 14px; background:#f1f5f9; border:1px solid #ccc; border-radius:4px; cursor:pointer;"
  data-file="${fileName}">
  Validate Excel
  </button>

  <button id="confirmImportBtn"
  style="padding:8px 14px; background:#9ca3af; color:white; border:none; border-radius:4px; cursor:not-allowed;"
  data-file="${fileName}"
  disabled>
  Validate Excel to Enable Import
  </button>

  </div>
  `;

  container.innerHTML = table;

  document.getElementById("confirmImportBtn")
    .addEventListener("click", confirmInwardImport);

  document.getElementById("validateImportBtn")
    .addEventListener("click", validateInwardImport);
}


async function confirmInwardImport(e) {

  const fileName = e.target.dataset.file;

  if (!fileName) {
    alert("File reference missing");
    return;
  }

  if (!confirm("Start importing this Excel file?")) {
    return;
  }

  const res = await fetch("/admin/import-inward-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ file: fileName })
  });


  if (!res.ok) {
    alert("Upload request failed");
    return;
  }

  const data = await res.json();

  if (!data.success) {
    alert(data.message || "Import failed");
    return;
  }

  let message =
    `Import Complete

      Inserted: ${data.inserted}
      Skipped: ${data.skipped}`;

  if (data.skippedRows && data.skippedRows.length) {

    message += "\n\nSkipped Rows:\n";

    data.skippedRows.forEach(r => {
      message += `Row ${r.row} (Inward ${r.inward_no}) → ${r.reason}\n`;
    });

  }

  alert(
    `✅ Import Successful

      Inserted: ${data.inserted}
      Skipped: ${data.skipped}`
  );

  document.getElementById("inwardExcelFile").value = "";
  document.getElementById("excelPreviewContainer").innerHTML = "";

  renderImportResultUI({
  containerId: "excelImportResult",
  title: "Inward Import Result",
  data,
  type: "inward"
});

}


async function validateInwardImport(e) {

  const fileName = e.target.dataset.file;

  const res = await fetch("/admin/import-inward-validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ file: fileName })
  });

  if (!res.ok) {
    alert("Upload request failed");
    return;
  }
  const data = await res.json();


  if (!data.success) {
    alert(data.message || "Validation failed");
    return;
  }

  // Store validation results globally
  window.__excelValidation = data;

  // Highlight rows
  highlightPreviewRows({
    containerSelector: "#excelPreviewContainer",
    schema: INWARD_SCHEMA,
    skippedRows: data.skippedRows,
    type: "inward"
  });


  renderImportResultUI({
    containerId: "excelImportResult",
    title: "Inward Import Result",
    data,
    type: "inward"
  });


  const importBtn = document.getElementById("confirmImportBtn");
  if (!importBtn) return;

  /* Count REAL errors (not duplicates) */

  const realErrors = countRealErrors(data.skippedRows);

  if (realErrors > 0) {

    importBtn.disabled = true;
    importBtn.style.background = "#9ca3af";
    importBtn.style.cursor = "not-allowed";
    importBtn.innerText = "Fix Excel Errors First";

  } else {

    importBtn.disabled = false;
    importBtn.style.background = "#0b3b66";
    importBtn.style.cursor = "pointer";
    importBtn.innerText = "Import Data";

  }
}



async function validateOutwardImport(e) {

  const fileName = e.target.dataset.file;

  const res = await fetch("/admin/import-outward-validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ file: fileName })
  });

  if (!res.ok) {
    alert("Validation request failed");
    return;
  }

  const data = await res.json();

  if (!data.success) {
    alert(data.message || "Validation failed");
    return;
  }

  highlightPreviewRows({
    containerSelector: "#outwardExcelPreviewContainer",
    schema: OUTWARD_SCHEMA,
    skippedRows: data.skippedRows,
    type: "outward"
  });

  renderImportResultUI({
    containerId: "outwardExcelImportResult",
    title: "Outward Import Result",
    data,
    type: "outward"
  });

  const importBtn = document.getElementById("confirmOutwardImportBtn");

  if (!importBtn) return;

  const realErrors = countRealErrors(data.skippedRows);

if (realErrors > 0) {

  importBtn.disabled = true;
  importBtn.style.background = "#9ca3af";
  importBtn.style.cursor = "not-allowed";
  importBtn.innerText = "Fix Excel Errors First";

} else {

  importBtn.disabled = false;
  importBtn.style.background = "#0b3b66";
  importBtn.style.cursor = "pointer";
  importBtn.innerText = "Import Data";

}

}

async function confirmOutwardImport(e) {

  const fileName = e.target.dataset.file;

  if (!fileName) {
    alert("File reference missing");
    return;
  }

  if (!confirm("Start importing this Excel file?")) {
    return;
  }

  const res = await fetch("/admin/import-outward-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ file: fileName })
  });

  if (!res.ok) {
    alert("Import request failed");
    return;
  }

  const data = await res.json();

  if (!data.success) {
    alert(data.message || "Import failed");
    return;
  }

  alert(
`✅ Outward Import Successful

Inserted: ${data.inserted}
Skipped: ${data.skipped}`
  );

  document.getElementById("outwardExcelFile").value = "";
  document.getElementById("outwardExcelPreviewContainer").innerHTML = "";

  renderImportResultUI({
  containerId: "outwardExcelImportResult",
  title: "Outward Import Result",
  data,
  type: "outward"
});
}


async function uploadOutwardExcel() {

  const fileInput = document.getElementById("outwardExcelFile");
  document.getElementById("outwardExcelImportResult").innerHTML = "";

  if (!fileInput.files.length) {
    alert("Please select an Excel file");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  const res = await fetch("/admin/import-outward-upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  });

  if (!res.ok) {
    alert("Upload request failed");
    return;
  }

  const data = await res.json();

  if (!data.success) {
    alert(data.message || "Upload failed");
    return;
  }

  const missingColumns = validateOutwardExcelSchema(data.preview);

  if (missingColumns.length) {

    alert(
      "Excel format incorrect.\n\nMissing columns:\n\n" +
      missingColumns.join("\n")
    );

    return;
  }

  renderOutwardExcelPreview(data.preview, data.totalRows, data.file);

}

function renderOutwardExcelPreview(rows, totalRows, fileName) {

  const container = document.getElementById("outwardExcelPreviewContainer");

  if (!rows || !rows.length) {
    container.innerHTML = "<p>No data found</p>";
    return;
  }

  let table = `
  <h4>Preview (${totalRows} rows in file)</h4>

  <div style="margin-bottom:8px;font-size:13px;">
  <span style="background:#fa9ca3;padding:3px 8px;border-radius:4px;">Duplicate in Database</span>
  <span style="background:#fcb761;padding:3px 8px;border-radius:4px;margin-left:8px;">Duplicate in Excel</span>
  <span style="background:#fef3c7;padding:3px 8px;border-radius:4px;margin-left:8px;">Invalid Language</span>
  </div>

  <div style="max-height:500px; overflow:auto; border:1px solid #ddd;">

  <table border="1" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:13px;">
  <thead style="position:sticky; top:0; background:#f8fafc; z-index:2;">
  <tr>
  ${OUTWARD_SCHEMA.map(c => `<th>${c}</th>`).join("")}
  </tr>
  </thead>
  <tbody>
  `;

  rows.forEach(row => {

    table += "<tr>";

    OUTWARD_SCHEMA.forEach(col => {
      table += `<td>${row[col] ?? ""}</td>`;
    });

    table += "</tr>";

  });

  table += `
  </tbody>
  </table>
  </div>
  `;

  table += `

<div style="margin-top:12px; display:flex; gap:10px;">

<button id="validateOutwardImportBtn"
style="padding:8px 14px; background:#f1f5f9; border:1px solid #ccc; border-radius:4px; cursor:pointer;"
data-file="${fileName}">
Validate Excel
</button>

<button id="confirmOutwardImportBtn"
style="padding:8px 14px; background:#9ca3af; color:white; border:none; border-radius:4px; cursor:not-allowed;"
data-file="${fileName}"
disabled>
Validate Excel to Enable Import
</button>

</div>
`;

  container.innerHTML = table;

  // Attach button listeners
  document
    .getElementById("validateOutwardImportBtn")
    ?.addEventListener("click", validateOutwardImport);

  document
    .getElementById("confirmOutwardImportBtn")
    ?.addEventListener("click", confirmOutwardImport);

}


// ===============================
// ADMIN: LOAD NOTINGS
// ===============================
async function loadNotingsAdmin() {
  const tbody = document.getElementById("notingsAdminTableBody");
  if (!tbody) return;

  const month = document.getElementById("adminNotingsMonth").value;
  const year = document.getElementById("adminNotingsYear").value;
  const group = document.getElementById("adminNotingsGroup").value;

  // Prevent useless API call
  if (!month || !year) {
      tbody.innerHTML = `<tr><td colspan="7">Select Month and Year</td></tr>`;
      return;
    }

  tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;

  try {
    let url = `/admin/notings?month=${month}&year=${year}`;

      if (group) {
        url += `&group=${encodeURIComponent(group)}`;
      }

      const res = await fetch(url, {
        credentials: "same-origin"
      });

    const data = await res.json();

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7">No records found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${r.group_name}</td>
        <td>${r.month}/${r.year}</td>
        <td>${r.notings_hindi_pages}</td>
        <td>${r.notings_english_pages}</td>
        <td>${r.eoffice_comments ?? 0}</td>
        <td>
          ${r.status === "confirmed"
            ? "<span style='color:green;font-weight:600'>Confirmed</span>"
            : "<span style='color:orange'>Pending</span>"
          }
        </td>
        <td>
          ${r.status === "confirmed"
            ? "-"
            : `<button class="btn-small edit-noting-btn" data-id="${r.id}">Edit</button>
               <button class="btn-small confirm-noting-btn" data-id="${r.id}">Confirm</button>`
          }
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Notings load error:", err);
  }
}


// ===============================
// ADMIN: CONFIRM NOTING
// ===============================
document.addEventListener("click", async (e) => {

  const btn = e.target.closest(".confirm-noting-btn");
  if (!btn) return;

  const id = btn.dataset.id;

  if (!confirm("Confirm this noting? This cannot be undone.")) return;

  try {
    const res = await fetch("/admin/notings/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({ id })
    });

    const data = await res.json();

    if (data.success) {
      alert("Confirmed successfully");
      loadNotingsAdmin(); // reload table
    }

  } catch (err) {
    console.error("Confirm error:", err);
  }

});


(function initAdminNotingsYear() {
  const sel = document.getElementById("adminNotingsYear");
  if (!sel) return;
  const now = new Date().getFullYear();

  for (let y = now + 2; y >= now - 5; y--) {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    sel.appendChild(o);
  }
})();


