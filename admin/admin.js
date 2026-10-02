(() => {
  "use strict";

  const API = (window.API_BASE || "").replace(/\/$/, "");
  const TOKEN_KEY = "pta_admin_token";
  const page = document.body.dataset.page;
  const $ = (sel) => document.querySelector(sel);

  // Everything a visitor typed is untrusted: always escape before putting it in HTML.
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    location.replace("login.html");
  };

  async function api(path, { method = "GET", json, auth = true, raw = false } = {}) {
    const headers = {};
    if (auth && getToken()) headers.Authorization = "Bearer " + getToken();
    if (json !== undefined) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
    } catch (_) {
      throw new Error("Cannot reach the server. Is the backend running?");
    }
    if (res.status === 401 && auth) {
      logout();
      throw new Error("Session expired. Please sign in again.");
    }
    if (!res.ok) {
      let detail;
      try { detail = (await res.json()).detail; } catch (_) {}
      throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }

  // ---------------------------------------------------------------- login page
  if (page === "login") {
    if (getToken()) location.replace("index.html");
    const form = $("#loginForm");
    const errBox = $("#loginError");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.textContent = "";
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        const data = await api("/api/admin/login", {
          method: "POST",
          auth: false,
          json: { username: form.username.value, password: form.password.value },
        });
        localStorage.setItem(TOKEN_KEY, data.access_token);
        location.replace("index.html");
      } catch (err) {
        errBox.textContent = err.message;
        btn.disabled = false;
      }
    });
    return;
  }

  // ------------------------------------------------------------- dashboard page
  if (page !== "dashboard") return;
  if (!getToken()) { location.replace("login.html"); return; }

  const state = { page: 1, pageSize: 20, q: "", status: "", service: "", pages: 1, total: 0, openId: null };
  const STATUSES = ["new", "read", "replied", "archived"];

  const parseDate = (iso) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  const fmtDate = (iso) => parseDate(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const fmtFull = (iso) => parseDate(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" });
  const truncate = (t, n) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
  const telHref = (p) => "tel:" + String(p).replace(/[^\d+]/g, "");

  let toastTimer;
  function toast(text, isError = false) {
    const el = $("#toast");
    el.textContent = text;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = "toast"), 3000);
  }

  // ---- stats
  async function loadStats() {
    const s = await api("/api/admin/stats");
    $("#stTotal").textContent = s.total;
    $("#stNew").textContent = s.new;
    $("#stToday").textContent = s.today;
    $("#stWeek").textContent = s.last_7_days;
    $("#stReplied").textContent = s.replied;
  }

  // ---- service filter options
  async function loadServices() {
    const list = await api("/api/admin/services");
    const sel = $("#serviceFilter");
    const current = state.service;
    sel.innerHTML = '<option value="">All services</option>' + list.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    sel.value = list.includes(current) ? current : "";
    state.service = sel.value;
  }

  // ---- list
  const queryString = (extra = {}) => {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.status) p.set("status", state.status);
    if (state.service) p.set("service", state.service);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  };

  async function loadMessages() {
    const data = await api("/api/admin/messages?" + queryString({ page: state.page, page_size: state.pageSize }));
    state.total = data.total;
    state.pages = data.pages;
    if (state.page > data.pages) { state.page = data.pages; return loadMessages(); }

    $("#msgBody").innerHTML = data.items
      .map(
        (m) => `<tr data-id="${m.id}" tabindex="0" class="${m.status === "new" ? "unread" : ""}">
          <td data-label="Status"><span class="badge ${esc(m.status)}">${esc(m.status)}</span></td>
          <td data-label="Name"><strong>${esc(m.name)}</strong></td>
          <td data-label="Contact">${esc(m.email)}<br><small>${esc(m.phone)}</small></td>
          <td data-label="Service">${esc(m.service)}</td>
          <td data-label="Message" class="preview">${esc(truncate(m.message, 100))}</td>
          <td data-label="Received" class="when">${esc(fmtDate(m.created_at))}</td>
        </tr>`
      )
      .join("");

    const empty = $("#emptyState");
    const filtered = state.q || state.status || state.service;
    empty.hidden = data.items.length > 0;
    empty.textContent = filtered ? "No messages match your search or filters." : "No messages yet. Submissions from the contact form will appear here.";
    $("#msgTable").hidden = data.items.length === 0;

    const from = data.total ? (data.page - 1) * data.page_size + 1 : 0;
    const to = Math.min(data.page * data.page_size, data.total);
    $("#pagerInfo").textContent = `Showing ${from}–${to} of ${data.total} · Page ${data.page} of ${data.pages}`;
    $("#prevBtn").disabled = data.page <= 1;
    $("#nextBtn").disabled = data.page >= data.pages;
  }

  const refreshAll = () => Promise.all([loadStats(), loadMessages()]);

  // ---- detail drawer
  const drawer = $("#drawer"), overlay = $("#overlay");

  function field(label, html, full = false) {
    return `<div class="field${full ? " full" : ""}"><span>${esc(label)}</span><div>${html}</div></div>`;
  }

  function renderDrawer(m) {
    $("#dName").textContent = m.name;
    const badge = $("#dBadge");
    badge.textContent = m.status;
    badge.className = "badge " + m.status;

    const subject = encodeURIComponent("Re: Your enquiry – " + m.service);
    const greeting = encodeURIComponent(`Hello ${m.name},\n\nThank you for contacting Prudent Tech Academy.\n\n`);

    $("#drawerBody").innerHTML = `
      <div>
        <div class="section-title">Contact details</div>
        <div class="fields">
          ${field("Full name", esc(m.name))}
          ${field("Service required", esc(m.service))}
          ${field("Email address", `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`)}
          ${field("Phone number", `<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a>`)}
        </div>
      </div>
      <div>
        <div class="section-title">Project message</div>
        <div class="msg-box">${esc(m.message)}</div>
      </div>
      <div class="action-row">
        <a class="btn btn-primary" href="mailto:${esc(m.email)}?subject=${subject}&body=${greeting}">✉ Reply by email</a>
        <a class="btn btn-ghost" href="${esc(telHref(m.phone))}">📞 Call</a>
      </div>
      <div>
        <div class="section-title">Status</div>
        <div class="status-row" id="statusRow">
          ${STATUSES.map((s) => `<button type="button" class="btn btn-ghost${m.status === s ? " active" : ""}" data-status="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}
        </div>
      </div>
      <div>
        <div class="section-title">Internal notes (only visible to admins)</div>
        <textarea id="notesBox" maxlength="5000" placeholder="e.g. Called on Monday, sending a quote…">${esc(m.admin_notes)}</textarea>
        <div class="notes-actions"><button type="button" class="btn btn-ghost" id="saveNotes">Save notes</button></div>
      </div>
      <div class="meta">
        <div class="section-title">Submission details</div>
        <div class="fields">
          ${field("Received", esc(fmtFull(m.created_at)))}
          ${field("Last updated", esc(fmtFull(m.updated_at)))}
          ${field("Message ID", "#" + esc(m.id))}
          ${field("IP address", esc(m.ip_address || "Not recorded"))}
          ${field("Browser / device", esc(m.user_agent || "Not recorded"), true)}
        </div>
      </div>
      <div><button type="button" class="btn btn-danger" id="deleteBtn">🗑 Delete message</button></div>`;
  }

  function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    state.openId = null;
  }

  async function openMessage(id) {
    try {
      let m = await api("/api/admin/messages/" + id);
      state.openId = id;
      if (m.status === "new") {
        m = await api("/api/admin/messages/" + id, { method: "PATCH", json: { status: "read" } });
        refreshAll().catch(() => {});
      }
      renderDrawer(m);
      openDrawer();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function updateOpen(changes, okText) {
    try {
      const m = await api("/api/admin/messages/" + state.openId, { method: "PATCH", json: changes });
      renderDrawer(m);
      toast(okText);
      refreshAll().catch(() => {});
    } catch (err) {
      toast(err.message, true);
    }
  }

  // ---- events
  $("#msgBody").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (row) openMessage(Number(row.dataset.id));
  });
  $("#msgBody").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const row = e.target.closest("tr[data-id]");
      if (row) openMessage(Number(row.dataset.id));
    }
  });

  $("#drawerBody").addEventListener("click", async (e) => {
    const statusBtn = e.target.closest("[data-status]");
    if (statusBtn) return updateOpen({ status: statusBtn.dataset.status }, "Status updated");
    if (e.target.id === "saveNotes") return updateOpen({ admin_notes: $("#notesBox").value }, "Notes saved");
    if (e.target.id === "deleteBtn") {
      if (!confirm("Delete this message permanently? This cannot be undone.")) return;
      try {
        await api("/api/admin/messages/" + state.openId, { method: "DELETE" });
        closeDrawer();
        toast("Message deleted");
        refreshAll().catch(() => {});
      } catch (err) {
        toast(err.message, true);
      }
    }
  });

  $("#closeDrawer").addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  let searchTimer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadMessages().catch((er) => toast(er.message, true)); }, 300);
  });
  $("#statusFilter").addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; loadMessages().catch((er) => toast(er.message, true)); });
  $("#serviceFilter").addEventListener("change", (e) => { state.service = e.target.value; state.page = 1; loadMessages().catch((er) => toast(er.message, true)); });
  $("#prevBtn").addEventListener("click", () => { if (state.page > 1) { state.page--; loadMessages().catch((er) => toast(er.message, true)); } });
  $("#nextBtn").addEventListener("click", () => { if (state.page < state.pages) { state.page++; loadMessages().catch((er) => toast(er.message, true)); } });
  $("#refreshBtn").addEventListener("click", () => refreshAll().then(() => toast("Refreshed")).catch((er) => toast(er.message, true)));
  $("#logoutBtn").addEventListener("click", logout);

  $("#exportBtn").addEventListener("click", async () => {
    try {
      const res = await api("/api/admin/messages/export.csv?" + queryString(), { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `contact-messages-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---- start
  (async () => {
    try {
      const me = await api("/api/admin/me");
      $("#who").textContent = "Signed in as " + me.username;
      await loadServices();
      await refreshAll();
    } catch (err) {
      toast(err.message, true);
    }
    // pick up new submissions automatically
    setInterval(() => {
      if (document.visibilityState === "visible" && !state.openId) {
        refreshAll().then(loadServices).catch(() => {});
      }
    }, 60000);
  })();
})();
