import { useEffect, useMemo, useState } from "react"
import blondFuryImg from "./assets/blond-fury.jpg"
import "./App.css"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "" // "" = same origin (prod)
const API = {
  login: `${API_BASE_URL}/api/login`,
  regattas: `${API_BASE_URL}/api/regattas`,
  crew: `${API_BASE_URL}/api/crew-members`,
}

const API_KEY = import.meta.env.VITE_API_KEY || "";

function apiFetch(url, opts = {}) {
  const token = localStorage.getItem("token") || "";

  const headers = {
    "Content-Type": "application/json",
    "regatta-api-key": API_KEY,      // ✅ MUST MATCH BACKEND
    ...(opts.headers || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(url, { ...opts, headers });
}

const OMIT_KEYS = new Set(["_id", "__v"])

function prettyLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v)
}

function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

function formatValue(v) {
  if (v === null || v === undefined) return "—"
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return v.join(", ")
  if (isObject(v)) return JSON.stringify(v)
  return String(v)
}

function hasCert(assignment, needle) {
  const certs = Array.isArray(assignment?.certifications) ? assignment.certifications : []
  return certs.some((c) => String(c).toLowerCase().includes(String(needle).toLowerCase()))
}

function pct(num, denom) {
  if (!denom) return "0%"
  return `${Math.round((num / denom) * 100)}%`
}

// ---- Token helpers ----
function getToken() {
  return localStorage.getItem("token") || ""
}
function setToken(token) {
  localStorage.setItem("token", token)
}
function clearToken() {
  localStorage.removeItem("token")
}

/**
 * A tiny modal wrapper so we don’t need extra libs.
 */
function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button style={styles.smallBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  )
}

/**
 * Dynamic editor:
 * - Renders inputs for all keys on an object (except omitted)
 * - Supports adding arbitrary fields
 * - Supports editing string/number/boolean
 * - For arrays/objects: edits as JSON text
 */
function DynamicObjectForm({ valueObj, onChange, omitKeys = OMIT_KEYS }) {
  const [newKey, setNewKey] = useState("")
  const [newVal, setNewVal] = useState("")

  const keys = useMemo(() => {
    const obj = valueObj || {}
    return Object.keys(obj)
      .filter((k) => !omitKeys.has(k))
      .sort((a, b) => a.localeCompare(b))
  }, [valueObj, omitKeys])

  const setField = (key, nextVal) => {
    const next = { ...(valueObj || {}) }
    next[key] = nextVal
    onChange(next)
  }

  const removeField = (key) => {
    const next = { ...(valueObj || {}) }
    delete next[key]
    onChange(next)
  }

  const addField = () => {
    const k = newKey.trim()
    if (!k) return
    const vRaw = newVal.trim()
    const parsed = safeJsonParse(vRaw)
    const v = vRaw === "" ? "" : parsed.ok ? parsed.value : vRaw

    const next = { ...(valueObj || {}) }
    next[k] = v
    onChange(next)
    setNewKey("")
    setNewVal("")
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {keys.map((k) => {
        const v = valueObj?.[k]
        const vType = Array.isArray(v) ? "array" : typeof v

        if (vType === "string" || vType === "number") {
          return (
            <div key={k} style={styles.formRow}>
              <label style={styles.label}>{prettyLabel(k)}</label>
              <input
                style={styles.input}
                value={v ?? ""}
                onChange={(e) =>
                  setField(k, vType === "number" ? Number(e.target.value) : e.target.value)
                }
              />
              <button style={styles.ghostBtn} onClick={() => removeField(k)}>
                Remove
              </button>
            </div>
          )
        }

        if (vType === "boolean") {
          return (
            <div key={k} style={styles.formRow}>
              <label style={styles.label}>{prettyLabel(k)}</label>
              <input
                type="checkbox"
                checked={!!v}
                onChange={(e) => setField(k, e.target.checked)}
              />
              <button style={styles.ghostBtn} onClick={() => removeField(k)}>
                Remove
              </button>
            </div>
          )
        }

        return (
          <div key={k} style={{ ...styles.formRow, alignItems: "start" }}>
            <label style={styles.label}>{prettyLabel(k)}</label>
            <textarea
              style={styles.textarea}
              value={isObject(v) || Array.isArray(v) ? JSON.stringify(v, null, 2) : String(v)}
              onChange={(e) => {
                const parsed = safeJsonParse(e.target.value)
                if (parsed.ok) setField(k, parsed.value)
                else setField(k, e.target.value)
              }}
              rows={5}
            />
            <button style={styles.ghostBtn} onClick={() => removeField(k)}>
              Remove
            </button>
          </div>
        )
      })}

      <div style={styles.addFieldRow}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder="New field key (e.g., boatClass)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          style={{ ...styles.input, flex: 2 }}
          placeholder='New field value (e.g., "ORR 3" or {"a":1})'
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
        />
        <button style={styles.button} onClick={addField}>
          Add field
        </button>
      </div>
    </div>
  )
}

export default function App() {
  // auth state
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token") || ""
    const userRaw = localStorage.getItem("user")
    return { token, user: userRaw ? JSON.parse(userRaw) : null }
  })
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [authError, setAuthError] = useState("")

  const isLoggedIn = !!auth?.token
  const isAdmin = auth?.user?.role === "admin"

  // data state
  const [regattas, setRegattas] = useState([])
  const [crew, setCrew] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [selectedRegattaId, setSelectedRegattaId] = useState(null)
  const [selectedCrewId, setSelectedCrewId] = useState(null)

  // modals
  const [showRegattaModal, setShowRegattaModal] = useState(false)
  const [showCrewModal, setShowCrewModal] = useState(false)

  // modal form objects
  const [regattaDraft, setRegattaDraft] = useState(null)
  const [crewDraft, setCrewDraft] = useState(null)

  // crew selection in regatta modal
  const [selectedCrewIdsForRegatta, setSelectedCrewIdsForRegatta] = useState([])

  const login = async () => {
    setAuthError("")
    try {
      const res = await apiFetch(API.login, {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Login failed (${res.status}): ${txt}`)
      }

      const data = await res.json()
      setToken(data.token)
      localStorage.setItem("user", JSON.stringify(data.user || null))
      setAuth({ token: data.token, user: data.user || null })
      setLoginPassword("")
      await apiFetchAll()
    } catch (e) {
      setAuthError(e?.message || String(e))
    }
  }

  const logout = () => {
    clearToken()
    localStorage.removeItem("user")
    setAuth({ token: "", user: null })
    setRegattas([])
    setCrew([])
    setSelectedRegattaId(null)
    setSelectedCrewId(null)
  }

  const apiFetchAll = async () => {
    if (!isLoggedIn) return
    setLoading(true)
    setError("")
    try {
      const [r1, r2] = await Promise.all([apiFetch(API.regattas), apiFetch(API.crew)])
      if (!r1.ok) throw new Error(`Failed to apiFetch regattas (${r1.status})`)
      if (!r2.ok) throw new Error(`Failed to apiFetch crew members (${r2.status})`)
      const regData = await r1.json()
      const crewData = await r2.json()

      const regList = Array.isArray(regData) ? regData : []
      const crewList = Array.isArray(crewData) ? crewData : []

      setRegattas(regList)
      setCrew(crewList)

      if (regList.length && !selectedRegattaId) setSelectedRegattaId(regList[0]._id || regList[0].name)
      if (crewList.length && !selectedCrewId) setSelectedCrewId(crewList[0]._id || crewList[0].name)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isLoggedIn) apiFetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  const selectedRegatta = useMemo(() => {
    if (!selectedRegattaId) return null
    return regattas.find((r) => (r._id || r.name) === selectedRegattaId) || null
  }, [regattas, selectedRegattaId])

  const selectedCrewMember = useMemo(() => {
    if (!selectedCrewId) return null
    return crew.find((c) => (c._id || c.name) === selectedCrewId) || null
  }, [crew, selectedCrewId])

  const regattaStats = useMemo(() => {
    const list = selectedRegatta?.assignments || []
    const total = list.length
    const safety = list.filter((a) => hasCert(a, "safety")).length
    const mob = list.filter((a) => hasCert(a, "mob")).length
    return { total, safety, mob }
  }, [selectedRegatta])

  // permission for editing selected crew
  const canEditSelectedCrew =
    isAdmin ||
    (auth?.user?.role === "crew" &&
      auth?.user?.crewMemberId &&
      selectedCrewId &&
      String(auth.user.crewMemberId) === String(selectedCrewId))

  // --- CRUD helpers ---
  const saveRegatta = async () => {
    if (!regattaDraft) return

    const crewById = new Map(crew.map((c) => [String(c._id || c.id || c.name), c]))
    const existingAssignmentsByCrewId = new Map(
      (regattaDraft.assignments || []).map((a) => [
        String(a.crewMemberId || a._id || a.id || a.name),
        a,
      ])
    )

    const assignments = selectedCrewIdsForRegatta.map((crewId) => {
      const cm = crewById.get(String(crewId))
      const prior = existingAssignmentsByCrewId.get(String(crewId)) || {}
      return {
        crewMemberId: String(crewId),
        name: cm?.name || prior.name || "",
        position: prior.position || cm?.position || "",
        certifications: prior.certifications || cm?.certifications || [],
        shirtSize: prior.shirtSize || cm?.shirtSize || "",
        experienceLevel: prior.experienceLevel || cm?.experienceLevel || "",
      }
    })

    const payload = { ...regattaDraft, assignments }

    const isEdit = !!payload._id
    const url = isEdit ? `${API.regattas}/${payload._id}` : API.regattas
    const method = isEdit ? "PUT" : "POST"

    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      throw new Error(`Failed to save regatta (${res.status}): ${txt}`)
    }

    setShowRegattaModal(false)
    await apiFetchAll()
  }

  const saveCrew = async () => {
    if (!crewDraft) return
    const payload = { ...crewDraft }
    const isEdit = !!payload._id
    const url = isEdit ? `${API.crew}/${payload._id}` : API.crew
    const method = isEdit ? "PUT" : "POST"

    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      throw new Error(`Failed to save crew member (${res.status}): ${txt}`)
    }

    setShowCrewModal(false)
    await apiFetchAll()
  }

  const openAddRegatta = () => {
    setRegattaDraft({
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      boatClass: "",
      assignments: [],
    })
    setSelectedCrewIdsForRegatta([])
    setShowRegattaModal(true)
  }

  const openEditRegatta = () => {
    if (!selectedRegatta) return
    setRegattaDraft({ ...selectedRegatta })
    const ids = (selectedRegatta.assignments || []).map((a) => a.crewMemberId).filter(Boolean) || []
    setSelectedCrewIdsForRegatta(ids)
    setShowRegattaModal(true)
  }

  const openAddCrew = () => {
    setCrewDraft({
      name: "",
      email: "", // <-- important for login
      position: "",
      shirtSize: "",
      experienceLevel: "",
      certifications: [],
    })
    setShowCrewModal(true)
  }

  const openEditCrew = () => {
    if (!selectedCrewMember) return
    setCrewDraft({ ...selectedCrewMember })
    setShowCrewModal(true)
  }

  const toggleCrewForRegatta = (crewId) => {
    setSelectedCrewIdsForRegatta((prev) => {
      const s = new Set(prev.map(String))
      const id = String(crewId)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return Array.from(s)
    })
  }

  return (
    <div style={styles.page}>
      <header style={styles.hero}>
        <h1 style={styles.title}>Blond Fury Regatta Tracker</h1>
        <img src={blondFuryImg} alt="Blond Fury" style={styles.heroImage} />
      </header>

      {/* AUTH BAR */}
      <div style={styles.authBar}>
        {isLoggedIn ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              Logged in as <strong>{auth.user?.email || "user"}</strong>{" "}
              <span style={styles.muted}>({auth.user?.role || "unknown"})</span>
            </span>
            <button style={styles.ghostBtn} onClick={logout}>
              Log out
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={{ ...styles.input, width: 220 }}
              placeholder="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <input
              style={{ ...styles.input, width: 220 }}
              placeholder="password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button style={styles.button} onClick={login}>
              Log in
            </button>
            {authError ? <span style={styles.error}>{authError}</span> : null}
          </div>
        )}
      </div>

      <div style={styles.topRow}>
        <button style={styles.button} onClick={apiFetchAll} disabled={loading || !isLoggedIn}>
          {loading ? "Refreshing…" : "🔄 Refresh Data"}
        </button>
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {/* ACTIONS */}
      <div style={styles.actionsRow}>
        <div style={styles.actionsGroup}>
          <strong>Regattas:</strong>
          <button style={styles.button} onClick={openAddRegatta} disabled={!isAdmin}>
            + Add Regatta
          </button>
          <button style={styles.button} onClick={openEditRegatta} disabled={!isAdmin || !selectedRegatta}>
            ✎ Edit Selected Regatta
          </button>
          {!isAdmin && isLoggedIn ? <span style={styles.muted}>Admin required to edit regattas</span> : null}
        </div>
      </div>

      <main style={styles.main}>
        {/* REGATTA LIST */}
        <aside style={styles.panel}>
          <h3 style={{ marginTop: 0 }}>Regattas</h3>
          {!isLoggedIn ? (
            <div style={styles.muted}>Log in to load data</div>
          ) : (
            <ul style={styles.list}>
              {regattas.map((r) => {
                const id = r._id || r.name
                const active = id === selectedRegattaId
                return (
                  <li
                    key={id}
                    style={{ ...styles.listItem, ...(active ? styles.activeItem : {}) }}
                    onClick={() => setSelectedRegattaId(id)}
                  >
                    <strong>{r.name}</strong>
                    <div style={styles.muted}>{r.location || "—"}</div>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* REGATTA DETAILS */}
        <section style={styles.panel}>
          {selectedRegatta ? (
            <>
              <h2 style={{ marginTop: 0 }}>{selectedRegatta.name}</h2>

              <div style={styles.summary}>
                {Object.entries(selectedRegatta)
                  .filter(([k]) => !OMIT_KEYS.has(k))
                  .filter(([k]) => k !== "assignments")
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <div key={k} style={styles.summaryRow}>
                      <span style={styles.summaryLabel}>{prettyLabel(k)}:</span>{" "}
                      <span>{formatValue(v)}</span>
                    </div>
                  ))}
              </div>

              <h3 style={{ marginTop: 18 }}>Crew ({selectedRegatta.assignments?.length || 0})</h3>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Position</th>
                      <th style={styles.th}>Shirt</th>
                      <th style={styles.th}>Experience</th>
                      <th style={styles.th}>Certifications</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRegatta.assignments || []).map((a, i) => (
                      <tr key={a.crewMemberId || i}>
                        <td style={styles.td}>{a.name || "—"}</td>
                        <td style={styles.td}>{a.position || "—"}</td>
                        <td style={styles.td}>{a.shirtSize || "—"}</td>
                        <td style={styles.td}>{a.experienceLevel || "—"}</td>
                        <td style={styles.td}>
                          {Array.isArray(a.certifications) && a.certifications.length
                            ? a.certifications.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.statsRow}>
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Number of crew</div>
                  <div style={styles.statValue}>{regattaStats.total}</div>
                </div>

                <div style={styles.statCard}>
                  <div style={styles.statLabel}>% Safety @ Sea</div>
                  <div style={styles.statValue}>
                    {pct(regattaStats.safety, regattaStats.total)}
                    <span style={styles.statSub}>
                      {" "}
                      ({regattaStats.safety}/{regattaStats.total})
                    </span>
                  </div>
                </div>

                <div style={styles.statCard}>
                  <div style={styles.statLabel}>% Man Overboard Drill</div>
                  <div style={styles.statValue}>
                    {pct(regattaStats.mob, regattaStats.total)}
                    <span style={styles.statSub}>
                      {" "}
                      ({regattaStats.mob}/{regattaStats.total})
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={styles.muted}>Select a regatta</div>
          )}
        </section>
      </main>

      {/* CREW DIRECTORY */}
      <section style={{ ...styles.panel, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Crew Directory</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button style={styles.button} onClick={openAddCrew} disabled={!isAdmin}>
            + Add Crew Member
          </button>
          <button style={styles.button} onClick={openEditCrew} disabled={!canEditSelectedCrew || !selectedCrewMember}>
            ✎ Edit Selected Crew Member
          </button>
          {isLoggedIn && !isAdmin ? (
            <span style={styles.muted}>Non-admin users can only edit their own profile</span>
          ) : null}
        </div>

        <div style={styles.split}>
          <ul style={{ ...styles.list, margin: 0 }}>
            {crew.map((c) => {
              const id = c._id || c.name
              const active = id === selectedCrewId
              return (
                <li
                  key={id}
                  style={{ ...styles.listItem, ...(active ? styles.activeItem : {}) }}
                  onClick={() => setSelectedCrewId(id)}
                >
                  <strong>{c.name}</strong>
                  <div style={styles.muted}>{c.position || "—"}</div>
                </li>
              )
            })}
          </ul>

          <div style={styles.crewDetails}>
            {selectedCrewMember ? (
              <>
                <h4 style={{ marginTop: 0 }}>{selectedCrewMember.name}</h4>
                {Object.entries(selectedCrewMember)
                  .filter(([k]) => !OMIT_KEYS.has(k))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <div key={k} style={styles.summaryRow}>
                      <span style={styles.summaryLabel}>{prettyLabel(k)}:</span>{" "}
                      <span>{formatValue(v)}</span>
                    </div>
                  ))}
              </>
            ) : (
              <div style={styles.muted}>Select a crew member</div>
            )}
          </div>
        </div>
      </section>

      {/* REGATTA MODAL */}
      {showRegattaModal && (
        <Modal
          title={regattaDraft?._id ? "Edit Regatta" : "Add Regatta"}
          onClose={() => setShowRegattaModal(false)}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <DynamicObjectForm valueObj={regattaDraft} onChange={setRegattaDraft} omitKeys={new Set(["_id", "__v"])} />

            <div style={styles.divider} />

            <div>
              <h4 style={{ margin: "0 0 8px 0" }}>Assign crew to this regatta</h4>
              <div style={styles.crewPickGrid}>
                {crew.map((c) => {
                  const id = String(c._id || c.id || c.name)
                  const checked = selectedCrewIdsForRegatta.map(String).includes(id)
                  return (
                    <label key={id} style={styles.crewPickItem}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCrewForRegatta(id)} />
                      <span style={{ marginLeft: 8 }}>
                        {c.name} <span style={styles.muted}>({c.position || "—"})</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.ghostBtn} onClick={() => setShowRegattaModal(false)}>
                Cancel
              </button>
              <button
                style={styles.button}
                onClick={async () => {
                  try {
                    await saveRegatta()
                  } catch (e) {
                    alert(e?.message || String(e))
                  }
                }}
              >
                Save Regatta
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CREW MODAL */}
      {showCrewModal && (
        <Modal
          title={crewDraft?._id ? "Edit Crew Member" : "Add Crew Member"}
          onClose={() => setShowCrewModal(false)}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <DynamicObjectForm valueObj={crewDraft} onChange={setCrewDraft} />
            <div style={styles.modalFooter}>
              <button style={styles.ghostBtn} onClick={() => setShowCrewModal(false)}>
                Cancel
              </button>
              <button
                style={styles.button}
                onClick={async () => {
                  try {
                    await saveCrew()
                  } catch (e) {
                    alert(e?.message || String(e))
                  }
                }}
              >
                Save Crew Member
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------------- STYLES ---------------- */

const styles = {
  page: { padding: 24, fontFamily: "system-ui, sans-serif" },
  hero: { textAlign: "center", marginBottom: 14 },
  title: { marginBottom: 10 },
  heroImage: {
    maxWidth: "700px",
    width: "100%",
    borderRadius: 12,
    boxShadow: "0 10px 28px rgba(0,0,0,0.2)",
  },

  authBar: { margin: "10px 0 18px 0", display: "flex", justifyContent: "center" },

  topRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  actionsRow: { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" },
  actionsGroup: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },

  button: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
  },
  smallBtn: {
    padding: "4px 8px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px dashed #ddd",
    background: "white",
    cursor: "pointer",
  },

  error: { color: "crimson", fontSize: 13 },
  muted: { color: "#666", fontSize: 12 },

  main: { display: "grid", gridTemplateColumns: "300px 1fr", gap: 18, alignItems: "start", width: "100%" },
  panel: { border: "1px solid #ddd", borderRadius: 10, padding: 16 },

  list: { listStyle: "none", padding: 0, margin: 0 },
  listItem: {
    padding: 10,
    cursor: "pointer",
    borderBottom: "1px solid #eee",
    borderRadius: 8,
    marginBottom: 8,
  },
  activeItem: { background: "#eef6ff", border: "1px solid #d7e9ff" },

  summary: { marginTop: 10 },
  summaryRow: { marginBottom: 6 },
  summaryLabel: { fontWeight: 700 },

  tableWrap: { overflowX: "auto", border: "1px solid #eee", borderRadius: 10, marginTop: 10 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", background: "#fafafa", fontSize: 13 },
  td: { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13 },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 16 },
  statCard: { border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" },
  statLabel: { fontSize: 12, color: "#666", marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: 800 },
  statSub: { fontSize: 12, fontWeight: 500, color: "#666" },

  split: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  crewDetails: { border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    padding: 18,
    zIndex: 999,
  },
  modalCard: {
    width: "min(980px, 96vw)",
    maxHeight: "90vh",
    overflow: "auto",
    background: "white",
    borderRadius: 12,
    border: "1px solid #ddd",
    padding: 14,
  },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 },

  formRow: { display: "grid", gridTemplateColumns: "220px 1fr 90px", gap: 10, alignItems: "center" },
  label: { fontWeight: 700, fontSize: 13 },
  input: { padding: 10, borderRadius: 8, border: "1px solid #ddd", width: "100%" },
  textarea: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ddd",
    width: "100%",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  addFieldRow: { display: "flex", gap: 10, alignItems: "center" },
  divider: { height: 1, background: "#eee", margin: "6px 0" },

  crewPickGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 8 },
  crewPickItem: { border: "1px solid #eee", borderRadius: 10, padding: 10, cursor: "pointer", background: "#fafafa" },
}