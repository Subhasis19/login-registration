

(async function () {

  /* ---------------------------
     FETCH SESSION
  --------------------------- */
  async function fetchSession() {
    try {
      const r = await fetch("/session-info");
      if (!r.ok) throw new Error("Not logged in");
      return await r.json();
    } catch (e) {
      console.error("Session fetch failed:", e);
      window.location.href = "/";
      return null;
    }
  }

  /* ---------------------------
     SIDEBAR HIGHLIGHT
  --------------------------- */
  function setActiveMenuItem(page) {
    document.querySelectorAll(".menu-item").forEach((it) => {
      it.classList.remove("active");
      if (it.dataset.page === page) it.classList.add("active");
    });
  }

  /* ---------------------------
     DATE FORMATTER
  --------------------------- */
  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  let initialNotingsEditId = new URLSearchParams(window.location.search).get("id");

  function getDefaultNotingsTitle() {
    return window.currentUserGroup
      ? `Notings – Monthly Report (${window.currentUserGroup})`
      : "Notings – Monthly Report";
  }

  function toggleNotingsFields(entryType = document.getElementById("entryType")?.value) {
    const hindiField = document.getElementById("notingsHindiField");
    const englishField = document.getElementById("notingsEnglishField");
    const eofficeField = document.getElementById("notingsEofficeField");

    const isNoting = entryType === "Noting";
    const isComment = entryType === "Comment";

    if (hindiField) {
      hindiField.style.display = isNoting ? "" : "none";
    }

    if (englishField) {
      englishField.style.display = isNoting ? "" : "none";
    }

    if (eofficeField) {
      eofficeField.style.display = isComment ? "" : "none";
    }
  }

  function resetNotingsForm() {
    document.getElementById("notingsMonth").value = "";
    document.getElementById("notingsYear").value = "";
    document.getElementById("entryType").value = "";
    document.getElementById("notingsHindi").value = 0;
    document.getElementById("notingsEnglish").value = 0;
    document.getElementById("notingsEoffice").value = 0;

    const msg = document.getElementById("notingsMsg");
    if (msg) {
      msg.textContent = "";
      msg.style.color = "#777";
    }

    const btn = document.getElementById("saveNotingsBtn");
    if (btn) {
      btn.textContent = "Save";
      btn.disabled = false;
      delete btn.dataset.editId;
    }

    const title = document.getElementById("notingsTitle");
    if (title) {
      title.textContent = getDefaultNotingsTitle();
    }

    toggleNotingsFields("");
  }

  function syncDashboardUrl(page, extraParams = {}) {
    const url = new URL(window.location.href);

    url.searchParams.set("page", page);
    url.searchParams.delete("id");

    Object.entries(extraParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });

    window.history.replaceState({}, "", url);
  }

    /* ---------------------------
     LOAD REPORT GROUPS
  --------------------------- */
async function loadGroups(selectId, defaultText = "All Groups") {
  const select = document.getElementById(selectId);
  if (!select) return;

  // Reset dropdown
  select.innerHTML = `<option value="">${defaultText}</option>`;

  try {
    const res = await fetch("/admin/report/groups", {
      credentials: "same-origin"
    });

    if (!res.ok) throw new Error("Failed to load groups");

    const groups = await res.json();

    groups.forEach(group => {
      const opt = document.createElement("option");
      opt.value = group;
      opt.textContent = group;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error("loadGroups error:", err);
  }
}


  /* ---------------------------
    LOAD DASHBOARD (GLOBAL / MONTHLY)
  --------------------------- */
  async function loadDashboard(month = null, year = null) {
    setActiveCard(null);
    try {

      let url = "/dashboard/summary";

      if (month && year) {
        url += `?month=${month}&year=${year}`;
      }

      // ===== CONTROL TABLE SCROLL =====
      const inwardScroll = document.querySelector("#inwardsTable")?.closest(".table-scroll");
      const outwardScroll = document.querySelector("#outwardsTable")?.closest(".table-scroll");

      if (month && year) {
        if (inwardScroll) inwardScroll.style.maxHeight = "400px";
        if (outwardScroll) outwardScroll.style.maxHeight = "400px";
      } else {
        if (inwardScroll) inwardScroll.style.maxHeight = "none";
        if (outwardScroll) outwardScroll.style.maxHeight = "none";
      }


      const data = await apiFetch(url);

      // Update Cards
      document.getElementById("totalInwards").textContent = data.totalInwards;
      document.getElementById("totalOutwards").textContent = data.totalOutwards;
      document.getElementById("repliesPending").textContent = data.repliesPending;

      // Render Inwards
      const inwardTbody = document.getElementById("inwardsTbody");

      if (!data.inwards.length) {
        inwardTbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#999;">
              No records found.
            </td>
          </tr>`;
      } else {

        const rowsToShow = (month && year)
          ? data.inwards
          : data.inwards.slice(0, 5);

        inwardTbody.innerHTML = rowsToShow.map(r => {

          const isPending =
            r.reply_required === "Yes" && !r.reply_sent_date;

          return `
              <tr 
                class="record-row ${isPending ? 'pending-row' : ''}"
                data-type="inward"
                data-id="${r.s_no}"
              >
              <td>
                <strong>${r.inward_no}</strong>
                ${isPending ? `<span class="pending-badge">Pending</span>` : ''}
              </td>
              <td>${formatDate(r.date_of_receipt)}</td>
              <td>${r.name_of_sender}</td>
              <td>${r.received_in}</td>
            </tr>
          `;
        }).join("");
      }

      // Render Outwards
      const outwardTbody = document.getElementById("outwardsTbody");

      if (!data.outwards.length) {
        outwardTbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#999;">
              No records found.
            </td>
          </tr>`;
      } else {

        const rowsToShow = (month && year)
          ? data.outwards
          : data.outwards.slice(0, 5);

        outwardTbody.innerHTML = rowsToShow.map(r => `
            <tr 
              class="record-row"
              data-type="outward"
              data-id="${r.s_no}"
            >
            <td><strong>${r.outward_no}</strong></td>
            <td>${formatDate(r.date_of_despatch)}</td>
            <td>${r.name_of_receiver}</td>
            <td>${r.reply_from}</td>
          </tr>
        `).join("");
      }

    } catch (err) {
      console.error("loadDashboard error:", err);
      alert("Failed to load dashboard data");
    }
  }

  window.loadDashboard = loadDashboard;


  /* ---------------------------
    LOAD INWARD RECORDS
  --------------------------- */
  async function loadInwardRecords() {
    try {
      const res = await fetch("/inward/all");
      const rows = await res.json();

      document.getElementById("totalInwards").textContent = rows.length;

      const tbody = document.getElementById("inwardsTbody");

      if (!rows.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#999;">
              No recent records.
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = rows.slice(0, 5).map(r => {

      const isPending =
        r.reply_required === "Yes" && !r.has_outward;

      return `
          <tr data-id="${r.s_no}" class="inward-row"
            ${isPending ? 'style="background:#fff3cd;"' : ''}>
          <td>
            <strong>${r.inward_no}</strong>
            ${isPending ? `<span class="pending-badge">Pending</span>` : ''}
          </td>
          <td>${formatDate(r.date_of_receipt)}</td>
          <td>${r.name_of_sender}</td>
          <td>${r.received_in}</td>
        </tr>
      `;
    }).join("");


    } catch (err) {
      console.error("loadInwardRecords:", err);
    }
  }

  /* ---------------------------
     LOAD OUTWARD RECORDS
  --------------------------- */
  async function loadOutwardRecords() {
    try {
      const res = await fetch("/outward/all");
      const rows = await res.json();

      document.getElementById("totalOutwards").textContent = rows.length;

      const tbody = document.getElementById("outwardsTbody");

      if (!rows.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:20px; color:#999;">
              No recent records.
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = rows.slice(0, 5).map(r => `
        <tr>
          <td><strong>${r.outward_no}</strong></td>
          <td>${formatDate(r.date_of_despatch)}</td>
          <td>${r.name_of_receiver}</td>
          <td>${r.reply_from}</td>
        </tr>
      `).join("");

    } catch (err) {
      console.error("loadOutwardRecords:", err);
    }
  }

  /* ============================================================
     IFRAME LOADER
  ============================================================ */

  const dashboardView = document.getElementById("dashboardView");
  const iframeContainer = document.getElementById("iframeContainer");
  const formFrame = document.getElementById("formFrame");
  const iframeTitle = document.getElementById("iframeTitle");


  function openIframe(page) {
    hideAllViews(); 

    if (page === "inward") {
      formFrame.src = "/inward";
      iframeTitle.textContent = window.currentUserGroup
        ? `Inward Entry Form (${window.currentUserGroup})`
        : "Inward Entry Form";
    } else if (page === "outward") {
      formFrame.src = "/outward";
      iframeTitle.textContent = window.currentUserGroup
        ? `Outward Entry Form (${window.currentUserGroup})`
        : "Outward Entry Form";
    }

    iframeContainer.style.display = "block";

    setActiveMenuItem(page);
  }



  function hideAllViews() {
  dashboardView.style.display = "none";
  iframeContainer.style.display = "none";

  const adminPanel = document.getElementById("adminPanelView");
  if (adminPanel) adminPanel.style.display = "none";

  const notingsView = document.getElementById("notingsView");
  if (notingsView) notingsView.style.display = "none";

  const emailsView = document.getElementById("emailsView");
  if (emailsView) emailsView.style.display = "none";

}

   function goBackToDashboard() {
      if (formFrame) formFrame.src = "";
      syncDashboardUrl("dashboard");
      loadPage("dashboard");
    }

    /* ===============================
      DASHBOARD CARD ACTIVE STATE
    ================================ */

    function setActiveCard(cardId) {

      document.querySelectorAll(".stat-card").forEach(card => {
        card.classList.remove("active-card");
      });

      const activeCard = document.getElementById(cardId);
      if (activeCard) {
        activeCard.classList.add("active-card");
      }

    }




  /* ============================================================
     PAGE HANDLER
  ============================================================ */
  function loadPage(page) {
    hideAllViews();
    

    if (page === "dashboard") {
      dashboardView.style.display = "block";
      setActiveMenuItem("dashboard");
      loadDashboard();
      return;
    }


    if (page === "inward" || page === "outward") {
      openIframe(page);
      return;
    }

      if (page === "admin-panel") {

      document.getElementById("adminPanelView").style.display = "block";

      setActiveMenuItem("admin-panel");

      if (typeof window.__adminPanelLoadUsers === "function") {
        window.__adminPanelLoadUsers();
      }

      return;
    }

    if (page === "notings") {
        document.getElementById("notingsView").style.display = "block";
        setActiveMenuItem("notings");
        resetNotingsForm();
        setTimeout(checkNotingsStatus, 100);

        if (initialNotingsEditId && window.currentUserRole === "admin") {
          const editId = initialNotingsEditId;
          initialNotingsEditId = null;
          loadNotingForEdit(editId);
        } else {
          initialNotingsEditId = null;
        }

    return;
  }

      if (page === "emails") {
      document.getElementById("emailsView").style.display = "block";
      setActiveMenuItem("emails");
      document.getElementById("emailsMsg").textContent = "";
      document.getElementById("emailsMonth").value = "";
      document.getElementById("emailsYear").value = "";
      document.getElementById("emailsEnglish").value = 0;
      document.getElementById("emailsHindi").value = 0;
      document.getElementById("emailsEntryType").value = "";
      document.getElementById("emailsRegion").value = "";

      const et = document.getElementById("emailsTitle");
if (et) {
  et.textContent = window.currentUserGroup
    ? `Emails – Monthly Entry (${window.currentUserGroup})`
    : "Emails – Monthly Entry";
}

      return;
    }

}  

  // ===============================
  // COMMON YEAR DROPDOWN INITIALIZER
  // ===============================
  function populateYearDropdown(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const now = new Date().getFullYear();

    for (let y = now + 2; y >= now - 5; y--) {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      sel.appendChild(o);
    }
  }



["notingsMonth", "notingsYear"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", checkNotingsStatus);
});

document.getElementById("entryType")?.addEventListener("change", () => {
  toggleNotingsFields();
  checkNotingsStatus();
});



// ===============================
// COMMON FETCH HELPER
// ===============================
  async function apiFetch(url, options = {}) {
    try {
      const res = await fetch(url, options);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;

    } catch (err) {
      console.error("API error:", err);
      throw err;
    }
  }

  
  // COMMON MESSAGE HELPER
  // ===============================
  function setMessage(el, text, color) {
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  // ===============================
  // GET NOTINGS PAYLOAD
  // ===============================
  function getNotingsPayload() {
    const entryType = document.getElementById("entryType").value;

    return {
      month: document.getElementById("notingsMonth").value,
      year: document.getElementById("notingsYear").value,
      entry_type: entryType,
      hindi: entryType === "Noting"
        ? Number(document.getElementById("notingsHindi").value) || 0
        : 0,
      english: entryType === "Noting"
        ? Number(document.getElementById("notingsEnglish").value) || 0
        : 0,
      eoffice: entryType === "Comment"
        ? Number(document.getElementById("notingsEoffice").value) || 0
        : 0
    };
  }

  // ===============================
  // PREFILL NOTING (EDIT)
  // ===============================
  async function checkNotingsStatus() {
      const month = document.getElementById("notingsMonth").value;
      const year = document.getElementById("notingsYear").value;
      const entry_type = document.getElementById("entryType").value;
      const isComment = entry_type === "Comment";
      const btn = document.getElementById("saveNotingsBtn");
      const msg = document.getElementById("notingsMsg");

      if (!month || !year || !entry_type) {
        if (btn) btn.disabled = false;
        setMessage(msg, "", "#777");
        return;
      }

      const editId = document.getElementById("saveNotingsBtn")?.dataset.editId;
      const isAdminEdit = Boolean(editId && window.currentUserRole === "admin");
      const baseUrl = isAdminEdit ? "/admin/notings/check" : "/notings/check";
      let url = `${baseUrl}?month=${month}&year=${year}&entry_type=${encodeURIComponent(entry_type)}`;

      if (isAdminEdit) {
        url += `&id=${encodeURIComponent(editId)}`;
      }

      try {
        const data = await apiFetch(url);

        if (data.exists) {
          if (!isAdminEdit && isComment && data.allowResubmit && data.status !== "confirmed") {
            btn.disabled = false;
            setMessage(
              msg,
              data.message || "A comment entry already exists for this month. Saving again will update its value.",
              "green"
            );
            return;
          }

          btn.disabled = true;

          if (data.status === "confirmed") {
            setMessage(msg, data.message || "This record is already confirmed and cannot be modified.", "green");
          } else {
            setMessage(
              msg,
              data.message || "Already submitted. Waiting for admin approval",
              "orange"
            );
          }
        } else {
          btn.disabled = false;
          setMessage(msg, "", "#777");
        }
      } catch (err) {
        console.error("Check status error:", err);
        setMessage(document.getElementById("notingsMsg"), "Failed to check status", "red");
      }
  }

  async function loadNotingForEdit(id) {
    try {
      const res = await fetch(`/admin/notings/${id}`, {
        credentials: "same-origin"
      });

      if (!res.ok) throw new Error("Failed to fetch noting");

      const data = await res.json();

      document.getElementById("notingsMonth").value = data.month;
      document.getElementById("notingsYear").value = data.year;
      document.getElementById("entryType").value = data.entry_type;
      toggleNotingsFields(data.entry_type);
      document.getElementById("notingsHindi").value = data.notings_hindi_pages;
      document.getElementById("notingsEnglish").value = data.notings_english_pages;
      document.getElementById("notingsEoffice").value = data.eoffice_comments;

      const btn = document.getElementById("saveNotingsBtn");
      btn.textContent = "Update";
      btn.dataset.editId = id;
      btn.disabled = false;

      const title = document.getElementById("notingsTitle");
      if (title) {
        title.textContent = data.group_name
          ? `Notings – Edit Submission (${data.group_name})`
          : "Notings – Edit Submission";
      }

      if (typeof checkNotingsStatus === "function") {
        checkNotingsStatus();
      }
    } catch (err) {
      console.error("Prefill error:", err);
    }
  }


  // ===============================
  // VALIDATE NOTINGS
  // ===============================
  function validateNotings(payload, msgEl) {
    if (!payload.month || !payload.year || !payload.entry_type) {
      setMessage(msgEl, "Please select Month, Year and Entry Type", "red");
      return false;
    }
    return true;
  }




  // ===============================
  // GET EMAILS PAYLOAD
  // ===============================
  function getEmailsPayload() {
    return {
      month: document.getElementById("emailsMonth").value,
      year: document.getElementById("emailsYear").value,
      entry_type: document.getElementById("emailsEntryType").value,
      region: document.getElementById("emailsRegion").value,
      total_english: Number(document.getElementById("emailsEnglish").value) || 0,
      total_hindi: Number(document.getElementById("emailsHindi").value) || 0
    };
  }




  /* ============================================================
     INIT
  ============================================================ */

  const session = await fetchSession();

  if (session?.user) {
    const user = session.user;

     window.currentUserGroup = user.group || "";
     window.currentUserRole = user.role || "";

    document.getElementById("adminName").textContent = user.name;
    document.getElementById("welcomeName").textContent =   user.group ? `${user.name} (${user.group})` : user.name;

    // hide admin for non-admins
    if (user.role !== "admin") {
      const a = document.querySelector('[data-page="admin-panel"]');
      if (a) a.style.display = "none";
    }
  }

    loadGroups("reportGroup", "All Groups");
    loadGroups("adminNotingsGroup", "All Groups");
   
  populateYearDropdown("notingsYear");
  populateYearDropdown("emailsYear");
  populateYearDropdown("dashYear");
  



  // Sidebar click handlers
  document.querySelectorAll(".menu-item").forEach((it) => {
    it.addEventListener("click", (e) => {
      e.preventDefault();
      syncDashboardUrl(it.dataset.page);
      loadPage(it.dataset.page);
    });
  });


    document.querySelectorAll(".dashboard-back-btn").forEach(btn => {
      btn.addEventListener("click", goBackToDashboard);
    });

    /* ===============================
          DASHBOARD CARD CLICK FILTERS
      ================================ */

        document.getElementById("cardInwards")?.addEventListener("click", () => {

          setActiveCard("cardInwards");

          const month = document.getElementById("dashMonth").value;
          const year = document.getElementById("dashYear").value;

          loadDashboard(month || null, year || null);

          document.getElementById("inwardsTable")
            ?.scrollIntoView({ behavior: "smooth" });

        });

        document.getElementById("cardOutwards")?.addEventListener("click", () => {

            setActiveCard("cardOutwards");

            const month = document.getElementById("dashMonth").value;
            const year = document.getElementById("dashYear").value;

            loadDashboard(month || null, year || null);

            document.getElementById("outwardsTable")
              ?.scrollIntoView({ behavior: "smooth" });

          });

        document.getElementById("cardPending")?.addEventListener("click", () => {

          setActiveCard("cardPending");

          const rows = document.querySelectorAll("#inwardsTbody tr");

          rows.forEach(row => {
            if (!row.classList.contains("pending-row")) {
              row.style.display = "none";
            } else {
              row.style.display = "";
            }
          });

          document.getElementById("inwardsTable")
            ?.scrollIntoView({ behavior: "smooth" });

        });



    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        goBackToDashboard();
      }
    });

    const params = new URLSearchParams(window.location.search);
    const pageFromURL = params.get("page");

    if (pageFromURL) {
      loadPage(pageFromURL);
    } else {
      loadPage("dashboard");
    }

    document.addEventListener("click", async (e) => {
      const row = e.target.closest(".record-row");
      if (!row) return;

      const id = row.dataset.id;
      const type = row.dataset.type;

      if (!id || !type) return;

      try {
        if (type === "inward") {
          document.getElementById("modalTitle").textContent = "Inward Details";
          const res = await fetch(`/inward/details/${id}`);
          const data = await res.json();

          document.getElementById("inwardModalContent").innerHTML = `
            <p><strong>Inward No:</strong> ${data.inward_no}</p>
            <p><strong>Date of Receipt:</strong> ${formatDate(data.date_of_receipt)}</p>
            <p><strong>Month:</strong> ${data.month || "-"}</p>
            <p><strong>Year:</strong> ${data.year || "-"}</p>
            <p><strong>Office:</strong> ${data.received_in}</p>

            <hr>

            <p><strong>Sender Name:</strong> ${data.name_of_sender || "-"}</p>
            <p><strong>Address:</strong> ${data.address_of_sender || "-"}</p>
            <p><strong>City:</strong> ${data.sender_city || "-"}</p>
            <p><strong>State:</strong> ${data.sender_state || "-"}</p>
            <p><strong>PIN:</strong> ${data.sender_pin || "-"}</p>
            <p><strong>Region:</strong> ${data.sender_region || "-"}</p>
            <p><strong>Organisation Type:</strong> ${data.sender_org_type || "-"}</p>

            <hr>

            <p><strong>Document Type:</strong> ${data.type_of_document}</p>
            <p><strong>Language:</strong> ${data.language_of_document}</p>
            <p><strong>Document Count:</strong> ${data.count}</p>
            <p><strong>Remarks:</strong> ${data.remarks || "-"}</p>
            <p><strong>Issued To:</strong> ${data.issued_to || "-"}</p>

            <hr>

            <p><strong>Reply Required:</strong> ${data.reply_required}</p>
            <p><strong>Reply Sent Date:</strong> ${
              data.reply_sent_date
                ? new Date(data.reply_sent_date).toLocaleDateString("en-IN")
                : "-"
            }</p>
            <p><strong>Reply Reference No:</strong> ${data.reply_ref_no || "-"}</p>
            <p><strong>Reply Sent By:</strong> ${data.reply_sent_by || "-"}</p>
            <p><strong>Reply Language:</strong> ${data.reply_sent_in || "-"}</p>
            <p><strong>Reply Count:</strong> ${data.reply_count || 0}</p>
            <p><strong>Created At:</strong> ${formatDate(data.created_at)}</p>
          `;

          document.getElementById("inwardModal").style.display = "flex";
        }

        else if (type === "outward") {
          document.getElementById("modalTitle").textContent = "Outward Details";
          const res = await fetch(`/outward/details/${id}`);
          const data = await res.json();

          document.getElementById("inwardModalContent").innerHTML = `
            <p><strong>Outward No:</strong> ${data.outward_no}</p>
            <p><strong>Date of Despatch:</strong> ${formatDate(data.date_of_despatch)}</p>
            <p><strong>Month:</strong> ${data.month || "-"}</p>
            <p><strong>Year:</strong> ${data.year || "-"}</p>
            <p><strong>Reply From (Office):</strong> ${data.reply_from || "-"}</p>

            <hr>

            <p><strong>Receiver Name:</strong> ${data.name_of_receiver || "-"}</p>
            <p><strong>Address:</strong> ${data.address_of_receiver || "-"}</p>
            <p><strong>City:</strong> ${data.receiver_city || "-"}</p>
            <p><strong>State:</strong> ${data.receiver_state || "-"}</p>
            <p><strong>PIN:</strong> ${data.receiver_pin || "-"}</p>
            <p><strong>Region:</strong> ${data.receiver_region || "-"}</p>
            <p><strong>Organisation Type:</strong> ${data.receiver_org_type || "-"}</p>

            <hr>

            <p><strong>Document Type:</strong> ${data.type_of_document || "-"}</p>
            <p><strong>Language:</strong> ${data.language_of_document || "-"}</p>
            <p><strong>Document Count:</strong> ${data.count || 0}</p>

            <hr>

            <p><strong>Linked Inward No:</strong> ${data.inward_no || "-"}</p>

            <hr>

            <p><strong>Reply Issued By:</strong> ${data.reply_issued_by || "-"}</p>
            <p><strong>Reply Sent Date:</strong> ${
              data.reply_sent_date ? formatDate(data.reply_sent_date) : "-"
            }</p>
            <p><strong>Reply Reference No:</strong> ${data.reply_ref_no || "-"}</p>
            <p><strong>Reply Sent By:</strong> ${data.reply_sent_by || "-"}</p>
            <p><strong>Reply Language:</strong> ${data.reply_sent_in || "-"}</p>
            <p><strong>Reply Count:</strong> ${data.reply_count || 0}</p>

            <hr>

            <p><strong>Group Name:</strong> ${data.group_name || "-"}</p>
            <p><strong>Created At:</strong> ${formatDate(data.created_at)}</p>
          `;

          document.getElementById("inwardModal").style.display = "flex";
        }


      } catch (err) {
        console.error("Modal error:", err);
      }
    });

    document.getElementById("closeInwardModal")?.addEventListener("click", () => {
    document.getElementById("inwardModal").style.display = "none";
    });

    // Close when clicking outside modal
    document.getElementById("inwardModal")?.addEventListener("click", (e) => {
      if (e.target.id === "inwardModal") {
        document.getElementById("inwardModal").style.display = "none";
      }
    });

// ===============================
// SAVE NOTINGS
// ===============================
document.getElementById("saveNotingsBtn")?.addEventListener("click", () => {

  const msg = document.getElementById("notingsMsg");
  if (!msg) return;

  const btn = document.getElementById("saveNotingsBtn");
  const editId = btn.dataset.editId;

  const payload = getNotingsPayload();
  const isAdminEdit = Boolean(editId && window.currentUserRole === "admin");
  if (!validateNotings(payload, msg)) return;

  const requestUrl = isAdminEdit ? `/admin/notings/${encodeURIComponent(editId)}` : "/notings/save";
  const requestMethod = isAdminEdit ? "PATCH" : "POST";

  apiFetch(requestUrl, {
    method: requestMethod,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(data => {
      setMessage(msg, data.message || "Success", "green");
      if (!isAdminEdit && payload.entry_type === "Noting") {
        document.getElementById("saveNotingsBtn").disabled = true;
        return;
      }

      document.getElementById("saveNotingsBtn").disabled = false;
    })
    .catch(err => {
      setMessage(msg, err.message || "Error", "red");
    });

});


// ===============================
// SAVE EMAILS
// ===============================
document.getElementById("saveEmailsBtn")?.addEventListener("click", () => {

  const msg = document.getElementById("emailsMsg");
  if (!msg) return;

  const payload = getEmailsPayload();

  if (!payload.month || !payload.year || !payload.entry_type || !payload.region) {
    setMessage(msg, "Please fill all fields", "red");
    return;
  }

  apiFetch("/emails/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(data => {
      setMessage(msg, data.message || "Saved successfully", "green");
    })
    .catch(err => {
      setMessage(msg, err.message || "Error", "red");
    });

});


// ===============================
// DASHBOARD FILTER
// ===============================
document.getElementById("dashFilterBtn")?.addEventListener("click", () => {

  const month = document.getElementById("dashMonth").value;
  const year = document.getElementById("dashYear").value;

  if (!month || !year) {
    alert("Select Month and Year");
    return;
  }

  document.getElementById("dashFilterLabel").textContent =
    `Showing Data For: ${document.getElementById("dashMonth").selectedOptions[0].text} ${year}`;

  loadDashboard(month, year);
});


document.getElementById("dashClearBtn")?.addEventListener("click", () => {
  document.getElementById("dashMonth").value = "";
  document.getElementById("dashYear").value = "";
  document.getElementById("dashFilterLabel").textContent = "";
  loadDashboard();
});

  })();











