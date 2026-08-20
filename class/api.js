const ClassChainAPI = {
  base: () => window.CLASSCHAIN_API_BASE,

  token: () => localStorage.getItem("cc_token"),
  setSession(token, username, role) {
    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_username", username);
    localStorage.setItem("cc_role", role);
  },
  clearSession() {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_username");
    localStorage.removeItem("cc_role");
  },
  username: () => localStorage.getItem("cc_username"),
  role: () => localStorage.getItem("cc_role"),

  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(this.base() + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  login(username, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return this.request("/api/wallet/me");
  },
  transfer(toUsername, chain, amount) {
    return this.request("/api/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({ toUsername, chain, amount }),
    });
  },
  createStudent(username, password) {
    return this.request("/api/admin/students", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  listStudents() {
    return this.request("/api/admin/students");
  },
  distribute(username, chain, amount) {
    return this.request("/api/admin/distribute", {
      method: "POST",
      body: JSON.stringify({ username, chain, amount }),
    });
  },
  history() {
    return this.request("/api/wallet/history");
  },
  adminHistory() {
    return this.request("/api/admin/history");
  },
  resetStudentPassword(username, password) {
    return this.request(`/api/admin/students/${encodeURIComponent(username)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
  deleteStudent(username) {
    return this.request(`/api/admin/students/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  },
};
