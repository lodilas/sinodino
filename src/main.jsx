import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import "./styles.css";

const emptyLinkForm = {
  title: "",
  url: "",
  description: "",
  category_id: "",
  tags: "",
};

function App() {
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [links, setLinks] = useState([]);
  const [comments, setComments] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: categoryRows, error: categoryError }, { data: linkRows, error: linkError }] =
      await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase
          .from("links")
          .select("*, categories(name, slug), profiles(display_name)")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      ]);

    if (categoryError || linkError) {
      setMessage(categoryError?.message || linkError?.message);
      setLoading(false);
      return;
    }

    setCategories(categoryRows || []);
    setLinks(linkRows || []);

    const linkIds = (linkRows || []).map((link) => link.id);
    if (linkIds.length > 0) {
      const { data: commentRows, error: commentsError } = await supabase
        .from("comments")
        .select("*, profiles(display_name)")
        .in("link_id", linkIds)
        .order("created_at", { ascending: true });

      if (!commentsError) {
        setComments(groupComments(commentRows || []));
      }
    }

    setLoading(false);
  }

  const filteredLinks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return links.filter((link) => {
      const matchesCategory =
        activeCategory === "all" || link.category_id === activeCategory;
      const searchable = `${link.title} ${link.description} ${link.url}`.toLowerCase();
      return matchesCategory && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [activeCategory, links, search]);

  async function signInWithGithub() {
    const redirectUrl = normalizeUrl(
      import.meta.env.VITE_SITE_URL || new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) setMessage(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function submitLink(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      title: linkForm.title.trim(),
      url: linkForm.url.trim(),
      description: linkForm.description.trim(),
      category_id: linkForm.category_id,
    };

    const { error } = await supabase.from("links").insert(payload);

    if (error) {
      setMessage(error.message);
      return;
    }

    setLinkForm(emptyLinkForm);
    setMessage("Danke! Der Link wurde eingereicht und wartet auf Freigabe.");
  }

  async function submitComment(linkId) {
    const body = (commentDrafts[linkId] || "").trim();
    if (!body) return;

    const { error } = await supabase.from("comments").insert({ link_id: linkId, body });

    if (error) {
      setMessage(error.message);
      return;
    }

    setCommentDrafts((drafts) => ({ ...drafts, [linkId]: "" }));
    await loadData();
  }

  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <section className="empty-state">
          <h1>Kommentierte Linkliste</h1>
          <p>
            Supabase ist noch nicht konfiguriert. Kopiere <code>.env.example</code> nach{" "}
            <code>.env.local</code> und trage Projekt-URL und anon key ein.
          </p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="eyebrow">Seminar-Recherche</p>
          <h1>Kommentierte Linkliste</h1>
        </div>
        <AuthButton session={session} onSignIn={signInWithGithub} onSignOut={signOut} />
      </header>

      <main className="layout">
        <aside className="sidebar">
          <label>
            Suche
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Thema, Quelle, Kommentar"
            />
          </label>

          <nav aria-label="Kategorien">
            <button
              className={activeCategory === "all" ? "active" : ""}
              onClick={() => setActiveCategory("all")}
            >
              Alle Kategorien
            </button>
            {categories.map((category) => (
              <button
                className={activeCategory === category.id ? "active" : ""}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </nav>
        </aside>

        <section className="content">
          {message && <p className="notice">{message}</p>}

          {session && (
            <LinkForm
              categories={categories}
              form={linkForm}
              onChange={setLinkForm}
              onSubmit={submitLink}
            />
          )}

          {!session && (
            <p className="notice">Melde dich mit GitHub an, um Links und Kommentare beizutragen.</p>
          )}

          {loading ? (
            <p className="muted">Lade Links...</p>
          ) : (
            <div className="link-list">
              {filteredLinks.map((link) => (
                <article className="link-card" key={link.id}>
                  <div className="link-card-header">
                    <div>
                      <p className="category-label">{link.categories?.name}</p>
                      <h2>{link.title}</h2>
                    </div>
                    <a href={link.url} target="_blank" rel="noreferrer">
                      Oeffnen
                    </a>
                  </div>

                  <p>{link.description}</p>
                  <p className="meta">
                    Eingetragen von {link.profiles?.display_name || "Unbekannt"}
                  </p>

                  <section className="comments">
                    <h3>Kommentare</h3>
                    {(comments[link.id] || []).map((comment) => (
                      <p className="comment" key={comment.id}>
                        <strong>{comment.profiles?.display_name || "Student:in"}:</strong>{" "}
                        {comment.body}
                      </p>
                    ))}

                    {session && (
                      <div className="comment-form">
                        <input
                          value={commentDrafts[link.id] || ""}
                          onChange={(event) =>
                            setCommentDrafts((drafts) => ({
                              ...drafts,
                              [link.id]: event.target.value,
                            }))
                          }
                          placeholder="Kommentar ergaenzen"
                        />
                        <button onClick={() => submitComment(link.id)}>Senden</button>
                      </div>
                    )}
                  </section>
                </article>
              ))}

              {filteredLinks.length === 0 && <p className="muted">Keine passenden Links gefunden.</p>}
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}

function Shell({ children }) {
  return <div className="app-shell">{children}</div>;
}

function AuthButton({ session, onSignIn, onSignOut }) {
  if (session) {
    return (
      <button className="secondary" onClick={onSignOut}>
        Abmelden
      </button>
    );
  }

  return <button onClick={onSignIn}>Mit GitHub anmelden</button>;
}

function LinkForm({ categories, form, onChange, onSubmit }) {
  return (
    <form className="submit-panel" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          Titel
          <input
            required
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
          />
        </label>
        <label>
          URL
          <input
            required
            type="url"
            value={form.url}
            onChange={(event) => onChange({ ...form, url: event.target.value })}
          />
        </label>
        <label>
          Kategorie
          <select
            required
            value={form.category_id}
            onChange={(event) => onChange({ ...form, category_id: event.target.value })}
          >
            <option value="">Auswaehlen</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Kommentar zur Quelle
        <textarea
          required
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          rows="3"
        />
      </label>
      <button type="submit">Link einreichen</button>
    </form>
  );
}

function groupComments(rows) {
  return rows.reduce((groups, row) => {
    groups[row.link_id] = groups[row.link_id] || [];
    groups[row.link_id].push(row);
    return groups;
  }, {});
}

function normalizeUrl(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

createRoot(document.getElementById("root")).render(<App />);
