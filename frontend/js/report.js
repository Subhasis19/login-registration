/* ===== Report UI: view + pdf generation ===== */
(function () {
  const FILTER_IDS = ["reportMonth", "reportYear", "reportOffice", "reportGroup"];
  const PDF_BUTTON_DISABLED_STYLES = {
    opacity: "0.6",
    cursor: "not-allowed",
  };
  const PDF_BUTTON_ENABLED_STYLES = {
    opacity: "1",
    cursor: "pointer",
  };

  let cachedReportHtml = "";

  function getElement(id) {
    return document.getElementById(id);
  }

  function safeNumber(value) {
    return value == null ? 0 : Number(value) || 0;
  }

  function setPdfButtonState(enabled) {
    const pdfButton = getElement("downloadPdfBtn");
    if (!pdfButton) {
      return;
    }

    pdfButton.disabled = !enabled;
    Object.assign(
      pdfButton.style,
      enabled ? PDF_BUTTON_ENABLED_STYLES : PDF_BUTTON_DISABLED_STYLES
    );
  }

  function resetPdfCache() {
    cachedReportHtml = "";
    setPdfButtonState(false);
  }

  function getReportFilters() {
    return {
      month: Number(getElement("reportMonth")?.value),
      year: Number(getElement("reportYear")?.value),
      office: getElement("reportOffice")?.value || "",
      group: getElement("reportGroup")?.value || "",
    };
  }

  function getInwardRegionData(payload, region) {
    const regionData = payload?.inwardByRegion?.[region] || {};

    return {
      receivedEnglish: safeNumber(regionData.receivedEnglish),
      repliedHindi: safeNumber(regionData.repliedHindi),
      repliedEnglish: safeNumber(regionData.repliedEnglish),
      notExpected: safeNumber(regionData.notExpected),
    };
  }

  function getSection3RegionData(payload, region) {
    const regionData = payload?.section3ByRegion?.[region] || {};

    return {
      hindi: safeNumber(regionData.hindi),
      english: safeNumber(regionData.english),
      total: safeNumber(regionData.total),
      percent: safeNumber(regionData.percent),
    };
  }

  function getEmailReceivedValue(payload, region, type) {
    return safeNumber(payload?.emailReceived?.[region]?.[type]);
  }

  function getEmailRepliedValue(payload, region) {
    return safeNumber(payload?.emailReplied?.[region]);
  }

  function renderReportHtml(payload, filters) {
    const inwardA = getInwardRegionData(payload, "A");
    const inwardB = getInwardRegionData(payload, "B");
    const inwardC = getInwardRegionData(payload, "C");

    const section3A = getSection3RegionData(payload, "A");
    const section3B = getSection3RegionData(payload, "B");
    const section3C = getSection3RegionData(payload, "C");

    const notingsHindi = safeNumber(payload?.notingsHindi);
    const notingsEnglish = safeNumber(payload?.notingsEnglish);

    return `
<div id="reportHtml" style="font-family: Arial; font-size:14px; color:#000;">

  <h3 style="margin-bottom:4px;">Monthly data for Quarterly Report for Hindi Rajbhasha</h3>
  <div><strong>Month / Year : </strong>${filters.month} / ${filters.year}</div>
  <div>
    Office:
      <strong>${filters.office || "All Offices"}</strong>
  </div>


  <h4 style="margin-top:20px;">1. Letters received in Hindi (Official Language Rule - 5)</h4>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Total letters received in Hindi</td><td>${safeNumber(payload?.lettersReceivedHindi)}</td></tr>
    <tr><td>No. of letters not to be replied to</td><td>${safeNumber(payload?.notExpectedTotal)}</td></tr>
    <tr><td>Replied in Hindi</td><td>${safeNumber(payload?.repliesSentHindi)}</td></tr>
    <tr><td>Replied in English</td><td>${safeNumber(payload?.repliesSentEnglish)}</td></tr>
  </table>

  <h4 style="margin-top:25px;">2. Letters received in English but replied in Hindi</h4>

  <div style="margin-top:10px;">From Region 'A'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Letters received in English</td><td>${inwardA.receivedEnglish}</td></tr>
    <tr><td>Replied in Hindi</td><td>${inwardA.repliedHindi}</td></tr>
    <tr><td>Replied in English</td><td>${inwardA.repliedEnglish}</td></tr>
    <tr><td>Not expected to be replied</td><td>${inwardA.notExpected}</td></tr>
  </table>

  <div style="margin-top:10px;">From Region 'B'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Letters received in English</td><td>${inwardB.receivedEnglish}</td></tr>
    <tr><td>Replied in Hindi</td><td>${inwardB.repliedHindi}</td></tr>
    <tr><td>Replied in English</td><td>${inwardB.repliedEnglish}</td></tr>
    <tr><td>Not expected to be replied</td><td>${inwardB.notExpected}</td></tr>
  </table>

  <div style="margin-top:10px;">From Region 'C'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Letters received in English</td><td>${inwardC.receivedEnglish}</td></tr>
    <tr><td>Replied in Hindi</td><td>${inwardC.repliedHindi}</td></tr>
    <tr><td>Replied in English</td><td>${inwardC.repliedEnglish}</td></tr>
    <tr><td>Not expected to be replied</td><td>${inwardC.notExpected}</td></tr>
  </table>


  <h4 style="margin-top:25px;">3. Details of original letters issued</h4>

  <div>To Region 'A'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Issued in Hindi/Bilingual</td><td>${section3A.hindi}</td></tr>
    <tr><td>Issued in English</td><td>${section3A.english}</td></tr>
    <tr><td>Total issued</td><td>${section3A.total}</td></tr>
    <tr><td>Percentage Hindi/Bilingual</td><td>${section3A.percent}%</td></tr>
  </table>

  <div style="margin-top:10px;">To Region 'B'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Issued in Hindi/Bilingual</td><td>${section3B.hindi}</td></tr>
    <tr><td>Issued in English</td><td>${section3B.english}</td></tr>
    <tr><td>Total issued</td><td>${section3B.total}</td></tr>
    <tr><td>Percentage Hindi/Bilingual</td><td>${section3B.percent}%</td></tr>
  </table>

  <div style="margin-top:10px;">To Region 'C'</div>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Issued in Hindi/Bilingual</td><td>${section3C.hindi}</td></tr>
    <tr><td>Issued in English</td><td>${section3C.english}</td></tr>
    <tr><td>Total issued</td><td>${section3C.total}</td></tr>
    <tr><td>Percentage Hindi/Bilingual</td><td>${section3C.percent}%</td></tr>
  </table>

  <h4 style="margin-top:25px;">4. Notings on files/documents (during quarter)</h4>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td>Notings in Hindi (pages)</td><td>${notingsHindi}</td></tr>
    <tr><td>Notings in English (pages)</td><td>${notingsEnglish}</td></tr>
    <tr><td>Total Notings</td><td>${notingsHindi + notingsEnglish}</td></tr>
    <tr><td>Comments sent through e-office</td><td>${safeNumber(payload?.notingsEoffice)}</td></tr>
  </table>

  <h4 style="margin-top:25px;">5. Emails received</h4>
  <table style="width:60%; border-collapse:collapse;">
    <tr><th>Region</th><th>English</th><th>Hindi</th></tr>
    <tr><td>A</td><td>${getEmailReceivedValue(payload, "A", "eng")}</td><td>${getEmailReceivedValue(payload, "A", "hin")}</td></tr>
    <tr><td>B</td><td>${getEmailReceivedValue(payload, "B", "eng")}</td><td>${getEmailReceivedValue(payload, "B", "hin")}</td></tr>
    <tr><td>C</td><td>${getEmailReceivedValue(payload, "C", "eng")}</td><td>${getEmailReceivedValue(payload, "C", "hin")}</td></tr>
  </table>

  <h4 style="margin-top:25px;">6. Emails replied in Hindi</h4>
  <table style="width:40%; border-collapse:collapse;">
    <tr><th>Region</th><th>Nos</th></tr>
    <tr><td>A</td><td>${getEmailRepliedValue(payload, "A")}</td></tr>
    <tr><td>B</td><td>${getEmailRepliedValue(payload, "B")}</td></tr>
    <tr><td>C</td><td>${getEmailRepliedValue(payload, "C")}</td></tr>
  </table>

  <div style="margin-top:40px;">
    <div>
      Group Name:
      <strong>${filters.group || "All Groups"}</strong>
    </div>

    <div style="margin-top:10px;">Group Head Name: <strong>${payload?.groupHeadName || ""}</strong></div>
    <div style="margin-top:10px;">Signature: __________________________</div>
  </div>

</div>
`;
  }

  async function fetchReportData(filters) {
    const response = await fetch("/admin/report/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(filters),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(
        (errorPayload && errorPayload.message) || "Failed to fetch report data"
      );
    }

    return response.json();
  }

  function ensureReportStylesheet() {
    if (getElement("report-css")) {
      return;
    }

    const link = document.createElement("link");
    link.id = "report-css";
    link.rel = "stylesheet";
    link.href = "/css/report.css";
    document.head.appendChild(link);
  }

  async function viewReport() {
    const filters = getReportFilters();
    if (!filters.month || !filters.year) {
      alert("Select month and year");
      return;
    }

    const previewContainer = getElement("reportPreviewContainer");
    if (!previewContainer) {
      return;
    }

    previewContainer.innerHTML =
      '<div style="padding:30px;text-align:center;color:#777">Loading report...</div>';

    try {
      const reportData = await fetchReportData(filters);
      ensureReportStylesheet();

      const reportHtml = renderReportHtml(reportData, filters);
      previewContainer.innerHTML = reportHtml;
      cachedReportHtml = reportHtml;
      setPdfButtonState(true);
    } catch (error) {
      console.error("viewReport:", error);
      previewContainer.innerHTML = `<div style="padding:30px;text-align:center;color:#c00">${error.message}</div>`;
      resetPdfCache();
    }
  }

  async function generatePdf() {
    const { month, year } = getReportFilters();

    if (!month || !year) {
      alert("Select month and year");
      return;
    }

    if (!cachedReportHtml) {
      alert("Please click View Report before generating PDF");
      return;
    }

    const monthName = new Date(year, month - 1).toLocaleString("en-US", {
      month: "short",
    });
    const filename = `Rajbhasha_Report_${monthName}_${year}.pdf`;

    try {
      const response = await fetch("/admin/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          html: cachedReportHtml,
          filename,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload && errorPayload.message) || "PDF generation failed"
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("generatePdf:", error);
      alert(error.message || "Failed to generate PDF");
    }
  }

  function populateReportYearOptions() {
    const yearSelect = getElement("reportYear");
    if (!yearSelect) {
      return;
    }

    const currentYear = new Date().getFullYear();

    for (let year = currentYear + 2; year >= currentYear - 5; year -= 1) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    }
  }

  function bindFilterChangeReset() {
    FILTER_IDS.forEach((id) => {
      const element = getElement(id);
      if (element) {
        element.addEventListener("change", resetPdfCache);
      }
    });
  }

  function initReportPage() {
    const viewButton = getElement("viewReportBtn");
    const pdfButton = getElement("downloadPdfBtn");

    setPdfButtonState(false);
    populateReportYearOptions();
    bindFilterChangeReset();

    if (viewButton) {
      viewButton.addEventListener("click", viewReport);
    }

    if (pdfButton) {
      pdfButton.addEventListener("click", generatePdf);
    }
  }

  document.addEventListener("DOMContentLoaded", initReportPage);
})();
