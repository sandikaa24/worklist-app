import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  MoreVertical,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const statuses = ["To Do", "In Progress", "Blocked", "Done"];
const priorities = ["Low", "Medium", "High", "Urgent"];
const categories = ["Finance", "Legal", "HR", "Operations", "Product"];
const tabs = ["All Items", ...statuses];

function emptyForm() {
  return {
    title: "",
    owner: "",
    priority: "High",
    status: "To Do",
    due_date: "",
    category: "Finance",
  };
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [editingItem, setEditingItem] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All Items");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadItems();

    const channel = supabase
      .channel("work_items_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_items",
        },
        () => {
          loadItems(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadItems(showLoader = true) {
    if (showLoader) setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("work_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      setErrorMessage("Gagal memuat data. Cek koneksi Supabase atau policy RLS.");
      setItems([]);
    } else {
      setItems(data || []);
    }

    if (showLoader) setLoading(false);
  }

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return items.filter((item) => {
      const searchable = [
        item.title,
        item.owner,
        item.priority,
        item.status,
        item.category,
        item.due_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchSearch = !keyword || searchable.includes(keyword);
      const matchTab = activeTab === "All Items" || item.status === activeTab;

      return matchSearch && matchTab;
    });
  }, [items, query, activeTab]);

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "Done") acc.done += 1;
        if (item.status === "In Progress") acc.progress += 1;
        if (item.status === "Blocked") acc.blocked += 1;
        if (item.priority === "High" || item.priority === "Urgent") acc.urgent += 1;
        return acc;
      },
      { total: 0, done: 0, progress: 0, blocked: 0, urgent: 0 }
    );
  }, [items]);

  async function addItem(e) {
    e.preventDefault();

    const payload = {
      ...form,
      title: form.title.trim(),
      owner: form.owner.trim(),
      due_date: form.due_date || null,
    };

    if (!payload.title) {
      setErrorMessage("Title wajib diisi.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("work_items")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error(error.message);
      setErrorMessage("Gagal menambahkan item.");
    } else {
      setItems((current) => [data, ...current]);
      setForm(emptyForm());
    }

    setSaving(false);
  }

  async function removeItem(id) {
    const previousItems = items;
    setProcessingId(id);
    setErrorMessage("");
    setItems((current) => current.filter((item) => item.id !== id));

    const { error } = await supabase.from("work_items").delete().eq("id", id);

    if (error) {
      console.error(error.message);
      setItems(previousItems);
      setErrorMessage("Gagal menghapus item. Data dikembalikan seperti semula.");
    }

    setProcessingId(null);
  }

  async function markDone(id) {
    await updateItemStatus(id, "Done");
  }

  async function updateItemStatus(id, status) {
    const previousItems = items;
    setProcessingId(id);
    setErrorMessage("");
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item))
    );

    const { error } = await supabase
      .from("work_items")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error(error.message);
      setItems(previousItems);
      setErrorMessage("Gagal mengubah status. Data dikembalikan seperti semula.");
    }

    setProcessingId(null);
  }

  function startEdit(item) {
    setEditingItem({ ...item, due_date: item.due_date || "" });
  }

  function cancelEdit() {
    setEditingItem(null);
  }

  async function saveEdit(e) {
    e.preventDefault();

    if (!editingItem?.title?.trim()) {
      setErrorMessage("Title wajib diisi.");
      return;
    }

    const payload = {
      title: editingItem.title.trim(),
      owner: editingItem.owner?.trim() || "",
      priority: editingItem.priority,
      status: editingItem.status,
      due_date: editingItem.due_date || null,
      category: editingItem.category,
    };

    const previousItems = items;
    setProcessingId(editingItem.id);
    setErrorMessage("");
    setItems((current) =>
      current.map((item) =>
        item.id === editingItem.id ? { ...item, ...payload } : item
      )
    );

    const { error } = await supabase
      .from("work_items")
      .update(payload)
      .eq("id", editingItem.id);

    if (error) {
      console.error(error.message);
      setItems(previousItems);
      setErrorMessage("Gagal menyimpan perubahan. Data dikembalikan seperti semula.");
    } else {
      setEditingItem(null);
    }

    setProcessingId(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-950 sm:text-4xl">Worklist</h1>
            <p className="text-sm text-slate-500 sm:text-base">Manage your work items efficiently</p>
            
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              placeholder="Search title, owner, status..."
            />
          </div>
        </header>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
          <Stat title="Total" value={stats.total} />
          <Stat title="Done" value={stats.done} />
          <Stat title="Progress" value={stats.progress} />
          <Stat title="Blocked" value={stats.blocked} />
          <Stat title="Urgent" value={stats.urgent} />
        </div>

        <form onSubmit={addItem} className="grid gap-3 rounded-2xl bg-white p-4 shadow sm:grid-cols-2 lg:grid-cols-7">
          <FloatingInput
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <FloatingInput
            label="Owner"
            value={form.owner}
            onChange={(e) => setForm({ ...form, owner: e.target.value })}
          />

          <FloatingSelect
            label="Priority"
            value={form.priority}
            options={priorities}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          />

          <FloatingSelect
            label="Status"
            value={form.status}
            options={statuses}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          />

          <FloatingSelect
            label="Category"
            value={form.category}
            options={categories}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <FloatingInput
            type="date"
            label="Due Date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />

          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              disabled={saving}
              className="h-11 w-full rounded-xl bg-violet-600 px-4 font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Adding..." : "Add"}
            </button>
          </div>
        </form>

        {editingItem && (
          <EditModal
            item={editingItem}
            setItem={setEditingItem}
            saving={processingId === editingItem.id}
            onSave={saveEdit}
            onCancel={cancelEdit}
          />
        )}

        <section className="overflow-hidden rounded-2xl bg-white shadow">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
            <div className="flex gap-3 overflow-x-auto text-sm font-bold text-slate-500 sm:flex-wrap sm:gap-5">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`shrink-0 border-b-2 pb-3 transition ${
                    activeTab === tab
                      ? "border-violet-600 text-violet-600"
                      : "border-transparent hover:text-slate-900"
                  }`}
                >
                  {tab} ({tab === "All Items" ? items.length : items.filter((item) => item.status === tab).length})
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto">
              <button className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">
                <Filter className="h-4 w-4" /> Filters
              </button>
              <button className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">
                <SlidersHorizontal className="h-4 w-4" /> Sort: Due Date
              </button>
            </div>
          </div>

          {loading ? (
            <p className="p-6 font-semibold text-slate-500">Loading...</p>
          ) : filteredItems.length === 0 ? (
            <p className="p-6 text-center font-semibold text-slate-500">No items found.</p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 md:hidden">
                {filteredItems.map((item) => (
                  <MobileItemCard
                    key={item.id}
                    item={item}
                    processingId={processingId}
                    onDone={markDone}
                    onDelete={removeItem}
                    onEdit={startEdit}
                    onStatusChange={updateItemStatus}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Title</th>
                      <th className="px-5 py-4">Owner</th>
                      <th className="px-5 py-4">Priority</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Due Date</th>
                      <th className="px-5 py-4">Category</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50/80">
                        <td className="px-5 py-4 font-black text-slate-900">{item.title}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 font-medium text-slate-700">
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-100 text-xs font-black text-cyan-700">
                              {initials(item.owner)}
                            </span>
                            {item.owner || "Unassigned"}
                          </div>
                        </td>
                        <td className="px-5 py-4"><Badge type="priority" value={item.priority} /></td>
                        <td className="px-5 py-4"><Badge type="status" value={item.status} /></td>
                        <td className="px-5 py-4 font-semibold text-slate-700">{formatDate(item.due_date)}</td>
                        <td className="px-5 py-4"><Badge type="category" value={item.category} /></td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              disabled={processingId === item.id || item.status === "Done"}
                              onClick={() => markDone(item.id)}
                              className="rounded-xl p-2 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Mark as done"
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </button>
                            <button
                              disabled={processingId === item.id}
                              onClick={() => removeItem(item.id)}
                              className="rounded-xl p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Delete"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => startEdit(item)}
                              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                              title="Edit"
                            >
                              <Pencil className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <span>Showing {filteredItems.length} of {items.length} items</span>
            <div className="flex flex-col items-end gap-1">
              <span className="font-semibold text-slate-400">Realtime enabled</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-600">Author by Sandika</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileItemCard({ item, processingId, onDone, onDelete, onEdit, onStatusChange }) {
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-black text-slate-900">{item.title}</h3>
          <p className="text-sm text-slate-500">{item.owner || "Unassigned"}</p>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            disabled={processingId === item.id || item.status === "Done"}
            onClick={() => onDone(item.id)}
            className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Mark as done"
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>

          <button
            disabled={processingId === item.id}
            onClick={() => onDelete(item.id)}
            className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>

          <button
            disabled={processingId === item.id}
            onClick={() => onEdit(item)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Edit"
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge type="priority" value={item.priority} />
        <Badge type="status" value={item.status} />
        <Badge type="category" value={item.category} />
      </div>

      <div className="flex flex-col gap-2 text-sm font-semibold text-slate-600">
        <p>Due: {formatDate(item.due_date)}</p>
        <select
          disabled={processingId === item.id}
          value={item.status}
          onChange={(e) => onStatusChange(item.id, e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
    </article>
  );
}

function EditModal({ item, setItem, saving, onSave, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form onSubmit={onSave} className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Edit Item</h2>
            <p className="text-sm text-slate-500">Update work item details.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FloatingInput
            label="Title"
            value={item.title || ""}
            onChange={(e) => setItem({ ...item, title: e.target.value })}
          />
          <FloatingInput
            label="Owner"
            value={item.owner || ""}
            onChange={(e) => setItem({ ...item, owner: e.target.value })}
          />
          <FloatingSelect
            label="Priority"
            value={item.priority || "High"}
            options={priorities}
            onChange={(e) => setItem({ ...item, priority: e.target.value })}
          />
          <FloatingSelect
            label="Status"
            value={item.status || "To Do"}
            options={statuses}
            onChange={(e) => setItem({ ...item, status: e.target.value })}
          />
          <FloatingSelect
            label="Category"
            value={item.category || "Finance"}
            options={categories}
            onChange={(e) => setItem({ ...item, category: e.target.value })}
          />
          <FloatingInput
            type="date"
            label="Due Date"
            value={item.due_date || ""}
            onChange={(e) => setItem({ ...item, due_date: e.target.value })}
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FloatingInput({ label, value, onChange, type = "text" }) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder=" "
        className="peer w-full rounded-xl border border-slate-200 px-3 pb-2 pt-5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
      <label className="absolute left-3 top-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-focus:top-1 peer-focus:text-xs peer-focus:text-violet-600">
        {label}
      </label>
    </div>
  );
}

function FloatingSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Badge({ type, value }) {
  const styles = {
    priority: {
      Low: "bg-slate-100 text-slate-700",
      Medium: "bg-orange-100 text-orange-700",
      High: "bg-red-100 text-red-700",
      Urgent: "bg-violet-100 text-violet-700",
    },
    status: {
      "To Do": "bg-blue-100 text-blue-700",
      "In Progress": "bg-indigo-100 text-indigo-700",
      Blocked: "bg-red-100 text-red-700",
      Done: "bg-emerald-100 text-emerald-700",
    },
    category: {
      Finance: "bg-violet-100 text-violet-700",
      Legal: "bg-emerald-100 text-emerald-700",
      HR: "bg-orange-100 text-orange-700",
      Operations: "bg-sky-100 text-sky-700",
      Product: "bg-pink-100 text-pink-700",
    },
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[type]?.[value] || "bg-slate-100 text-slate-700"}`}>
      {value || "-"}
    </span>
  );
}

function initials(name) {
  if (!name) return "?";

  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(date) {
  if (!date) return "No date";

  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
