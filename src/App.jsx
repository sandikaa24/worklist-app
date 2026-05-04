import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowDownAZ,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Columns3,
  Filter,
  Flame,
  LayoutList,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const STATUS_OPTIONS = ["Not Started", "In Progress", "Waiting", "Blocked", "Done"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const CATEGORY_OPTIONS = [
  "IGD",
  "POLI",
  "REKAM MEDIS",
  "RAWAT INAP",
  "LABORATORIUM",
  "RADIOLOGI",
  "FARMASI",
  "GIZI",
  "CASEMIX",
  "KEUANGAN",
  "HEMODIALISA",
  "KAMAR OPERASI",
  "LAINNYA",
];

const DEFAULT_FILTERS = {
  priority: "All",
  status: "All",
  category: "All",
  sort: "deadline",
};

function emptyForm() {
  return {
    title: "",
    description: "",
    owner: "",
    priority: "High",
    status: "Not Started",
    due_date: "",
    category: "IGD",
  };
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [editingItem, setEditingItem] = useState(null);
  const [completionItem, setCompletionItem] = useState(null);
  const [proofFiles, setProofFiles] = useState([]);
  const [proofPreviews, setProofPreviews] = useState([]);
  const [completionNote, setCompletionNote] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("worklist-theme");
    if (savedTheme) return savedTheme === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const [errorMessage, setErrorMessage] = useState("");

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      setErrorMessage("Gagal memuat data. Cek koneksi Supabase atau policy RLS.");
      setItems([]);
    } else {
      setErrorMessage("");
      setItems(data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("worklist-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    return () => {
      proofPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [proofPreviews]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      loadItems();
    }, 0);

    const channel = supabase
      .channel("work_items_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_items" },
        () => loadItems()
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      supabase.removeChannel(channel);
    };
  }, [loadItems]);

  const stats = useMemo(() => buildStats(items), [items]);
  const tabs = useMemo(() => ["All", ...STATUS_OPTIONS], []);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const result = items.filter((item) => {
      const searchable = [
        item.title,
        item.description,
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
      const matchTab = activeTab === "All" || item.status === activeTab;
      const matchPriority = filters.priority === "All" || item.priority === filters.priority;
      const matchStatus = filters.status === "All" || item.status === filters.status;
      const matchCategory = filters.category === "All" || item.category === filters.category;

      return matchSearch && matchTab && matchPriority && matchStatus && matchCategory;
    });

    return [...result].sort((a, b) => sortItems(a, b, filters.sort));
  }, [items, query, activeTab, filters]);

  const groupedItems = useMemo(() => {
    return STATUS_OPTIONS.reduce((acc, status) => {
      acc[status] = filteredItems.filter((item) => item.status === status);
      return acc;
    }, {});
  }, [filteredItems]);

  function resetProofForm() {
    proofPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setProofFiles([]);
    setProofPreviews([]);
    setCompletionNote("");
  }

  function openCompletionModal(item) {
    setCompletionItem(item);
    resetProofForm();
    setErrorMessage("");
  }

  function closeCompletionModal() {
    setCompletionItem(null);
    resetProofForm();
  }

  function handleProofFileChange(files) {
    proofPreviews.forEach((preview) => URL.revokeObjectURL(preview));

    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) {
      setProofFiles([]);
      setProofPreviews([]);
      return;
    }

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/"));
    if (invalidFile) {
      setProofFiles([]);
      setProofPreviews([]);
      setErrorMessage("Semua file bukti harus berupa gambar.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    const tooLargeFile = selectedFiles.find((file) => file.size > maxSize);
    if (tooLargeFile) {
      setProofFiles([]);
      setProofPreviews([]);
      setErrorMessage("Ukuran setiap foto bukti maksimal 2MB.");
      return;
    }

    setErrorMessage("");
    setProofFiles(selectedFiles);
    setProofPreviews(selectedFiles.map((file) => URL.createObjectURL(file)));
  }

  async function completeWithProof(e) {
    e.preventDefault();

    if (!completionItem?.id) return;
    if (proofFiles.length === 0) return setErrorMessage("Minimal 1 foto bukti wajib diupload sebelum item selesai.");

    const previousItems = items;

    setSaving(true);
    setProcessingId(completionItem.id);
    setErrorMessage("");

    const uploadedUrls = [];

    for (const file of proofFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
      const filePath = `proofs/${completionItem.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("work-proofs")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        console.error(uploadError.message);
        setErrorMessage("Gagal upload foto bukti. Pastikan bucket work-proofs sudah dibuat dan policy Storage sudah benar.");
        setSaving(false);
        setProcessingId(null);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("work-proofs").getPublicUrl(filePath);
      uploadedUrls.push(publicUrlData.publicUrl);
    }

    const completion_image_url = uploadedUrls[0];
    const completion_image_urls = uploadedUrls;
    const completed_at = new Date().toISOString();
    const cleanCompletionNote = completionNote.trim();

    const updatePayload = {
      status: "Done",
      completion_image_url,
      completion_image_urls,
      completed_at,
      completion_note: cleanCompletionNote,
    };

    setItems((current) =>
      current.map((item) =>
        item.id === completionItem.id ? { ...item, ...updatePayload } : item
      )
    );

    const { error } = await supabase
      .from("work_items")
      .update(updatePayload)
      .eq("id", completionItem.id);

    if (error) {
      console.error(error.message);
      setItems(previousItems);
      setErrorMessage("Foto berhasil diupload, tapi gagal menyimpan status Done. Cek kolom completion_image_url, completion_image_urls, completed_at, dan completion_note di database.");
    } else {
      closeCompletionModal();
    }

    setSaving(false);
    setProcessingId(null);
  }

  async function addItem(e) {
    e.preventDefault();

    const payload = sanitizeItem(form);
    if (!payload.title) return setErrorMessage("Title wajib diisi.");

    setSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase.from("work_items").insert([payload]).select().single();

    if (error) {
      console.error(error.message);
      setErrorMessage("Gagal menambahkan item.");
    } else {
      setItems((current) => [data, ...current]);
      setForm(emptyForm());
      setShowCreateModal(false);
    }

    setSaving(false);
  }

  async function removeItem(id) {
    const confirmed = window.confirm("Hapus item ini?");
    if (!confirmed) return;

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

  async function updateItemStatus(id, status) {
    const previousItems = items;
    setProcessingId(id);
    setErrorMessage("");
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));

    const { error } = await supabase.from("work_items").update({ status }).eq("id", id);

    if (error) {
      console.error(error.message);
      setItems(previousItems);
      setErrorMessage("Gagal mengubah status. Data dikembalikan seperti semula.");
    }

    setProcessingId(null);
  }

  function handleStatusChange(item, status) {
    if (status === "Done" && getProofUrls(item).length === 0) {
      openCompletionModal(item);
      return;
    }

    updateItemStatus(item.id, status);
  }

  async function saveEdit(e) {
    e.preventDefault();

    if (!editingItem?.title?.trim()) return setErrorMessage("Title wajib diisi.");

    const payload = sanitizeItem(editingItem);
    const previousItems = items;

    setProcessingId(editingItem.id);
    setErrorMessage("");
    setItems((current) => current.map((item) => (item.id === editingItem.id ? { ...item, ...payload } : item)));

    const { error } = await supabase.from("work_items").update(payload).eq("id", editingItem.id);

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
    <div className="min-h-screen bg-slate-100 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
      <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6">
          <HeroHeader
            query={query}
            setQuery={setQuery}
            viewMode={viewMode}
            setViewMode={setViewMode}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onCreate={() => setShowCreateModal(true)}
          />

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard title="Total" value={stats.total} icon={CircleDashed} tone="slate" />
          <StatCard title="Done" value={stats.done} icon={CheckCircle2} tone="emerald" />
          <StatCard title="Progress" value={stats.progress} icon={Clock3} tone="indigo" />
          <StatCard title="Blocked" value={stats.blocked} icon={ShieldAlert} tone="red" />
          <StatCard title="Urgent" value={stats.urgent} icon={Flame} tone="violet" />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
          <Toolbar
            tabs={tabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            items={items}
            filters={filters}
            setFilters={setFilters}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
          />

          {loading ? (
            <LoadingState />
          ) : filteredItems.length === 0 ? (
            <EmptyState onCreate={() => setShowCreateModal(true)} />
          ) : viewMode === "kanban" ? (
            <KanbanBoard
              groupedItems={groupedItems}
              processingId={processingId}
              onDone={openCompletionModal}
              onDelete={removeItem}
              onEdit={(item) => setEditingItem({ ...item, due_date: item.due_date || "" })}
              onStatusChange={handleStatusChange}
              onPreview={setPreviewImage}
            />
          ) : (
            <>
              <div className="divide-y divide-slate-100 overflow-visible md:hidden">
                {filteredItems.map((item) => (
                  <MobileItemCard
                    key={item.id}
                    item={item}
                    processingId={processingId}
                    onDone={openCompletionModal}
                    onDelete={removeItem}
                    onEdit={(item) => setEditingItem({ ...item, due_date: item.due_date || "" })}
                    onStatusChange={handleStatusChange}
                    onPreview={setPreviewImage}
                  />
                ))}
              </div>

              <DesktopTable
                items={filteredItems}
                processingId={processingId}
                onDone={openCompletionModal}
                onDelete={removeItem}
                onEdit={(item) => setEditingItem({ ...item, due_date: item.due_date || "" })}
                onStatusChange={handleStatusChange}
                onPreview={setPreviewImage}
              />
            </>
          )}

          <Footer filteredCount={filteredItems.length} totalCount={items.length} />
        </section>
      </main>

      {showCreateModal && (
        <ItemModal
          title="Tambah Work Item"
          subtitle="Buat task baru tanpa mengganggu daftar utama."
          item={form}
          setItem={setForm}
          saving={saving}
          onSave={addItem}
          onCancel={() => setShowCreateModal(false)}
          submitText="Add Item"
          loadingText="Adding..."
        />
      )}

      {completionItem && (
        <CompletionProofModal
          item={completionItem}
          files={proofFiles}
          previews={proofPreviews}
          note={completionNote}
          setNote={setCompletionNote}
          saving={saving && processingId === completionItem.id}
          onFileChange={handleProofFileChange}
          onSave={completeWithProof}
          onCancel={closeCompletionModal}
        />
      )}

      {previewImage && (
        <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {editingItem && (
          <ItemModal
          title="Edit Item"
          subtitle="Update detail project monitoring."
          item={editingItem}
          setItem={setEditingItem}
          saving={processingId === editingItem.id}
          onSave={saveEdit}
          onCancel={() => setEditingItem(null)}
          submitText="Save Changes"
          loadingText="Saving..."
        />
      )}
    </div>
  );
}

function HeroHeader({ query, setQuery, viewMode, setViewMode, darkMode, setDarkMode, onCreate }) {
  return (
    <header className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-violet-100">
            <Sparkles className="h-3.5 w-3.5" /> Realtime Project Monitoring
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Worklist</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
            Pantau pekerjaan, prioritas, deadline, dan status antar unit dalam satu dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-400/30"
              placeholder="Search title, owner, status..."
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setDarkMode((value) => !value)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15"
              title="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {darkMode ? "Light" : "Dark"}
            </button>
            <button
              onClick={() => setViewMode(viewMode === "table" ? "kanban" : "table")}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15"
            >
              {viewMode === "table" ? <Columns3 className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
              {viewMode === "table" ? "Kanban" : "Table"}
            </button>
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Toolbar({ tabs, activeTab, setActiveTab, items, filters, setFilters, showFilters, setShowFilters }) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
        <div className="flex gap-3 overflow-x-auto text-sm font-bold text-slate-500 sm:flex-wrap sm:gap-5">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 pb-3 transition ${
                activeTab === tab ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-300" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab} ({tab === "All" ? items.length : items.filter((item) => item.status === tab).length})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowFilters((value) => !value)}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
          >
            <Filter className="h-4 w-4" /> Filters
          </button>
          <SelectPill
            icon={ArrowDownAZ}
            value={filters.sort}
            onChange={(value) => setFilters((current) => ({ ...current, sort: value }))}
            options={[
              ["deadline", "Deadline"],
              ["priority", "Priority"],
              ["newest", "Newest"],
              ["title", "Title"],
            ]}
          />
        </div>
      </div>

      {showFilters && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-4 transition-colors dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-3 lg:p-5">
          <MiniSelect label="Priority" value={filters.priority} options={["All", ...PRIORITY_OPTIONS]} onChange={(priority) => setFilters((current) => ({ ...current, priority }))} />
          <MiniSelect label="Status" value={filters.status} options={["All", ...STATUS_OPTIONS]} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
          <MiniSelect label="Category" value={filters.category} options={["All", ...CATEGORY_OPTIONS]} onChange={(category) => setFilters((current) => ({ ...current, category }))} />
        </div>
      )}
    </div>
  );
}

function DesktopTable({ items, processingId, onDone, onDelete, onEdit, onStatusChange, onPreview }) {
  return (
    <div className="hidden overflow-x-auto overflow-y-visible md:block">
      <table className="w-full min-w-245 text-left text-sm">
        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <tr>
            <th className="px-5 py-4">Title</th>
            <th className="px-5 py-4">Owner</th>
            <th className="px-5 py-4">Priority</th>
            <th className="px-5 py-4">Status</th>
            <th className="px-5 py-4">Deadline</th>
            <th className="px-5 py-4">Category</th>
            <th className="px-5 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <tr key={item.id} className="group transition hover:bg-violet-50/30 dark:hover:bg-violet-500/10">
              <td className="px-5 py-4">
                <div className="max-w-xs truncate font-black text-slate-900 dark:text-white">{item.title}</div>
                {item.description && <p className="mt-1 max-w-xs truncate text-xs font-medium text-slate-500 dark:text-slate-300">{item.description}</p>}
                {isOverdue(item.due_date, item.status) && <p className="mt-1 text-xs font-bold text-red-600">Overdue</p>}
                {getProofUrls(item).length > 0 && <ProofLink urls={getProofUrls(item)} onPreview={onPreview} note={item.completion_note} />}
              </td>
              <td className="px-5 py-4">
                <Owner value={item.owner} />
              </td>
              <td className="px-5 py-4"><Badge type="priority" value={item.priority} /></td>
              <td className="px-5 py-4">
                <CustomSelect
                  disabled={processingId === item.id}
                  value={item.status}
                  options={STATUS_OPTIONS}
                  onChange={(status) => onStatusChange(item, status)}
                  size="sm"
                />
              </td>
              <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-200">{formatDate(item.due_date)}</td>
              <td className="px-5 py-4"><Badge type="category" value={item.category} /></td>
              <td className="px-5 py-4">
                <RowActions item={item} processingId={processingId} onDone={onDone} onDelete={onDelete} onEdit={onEdit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanBoard({ groupedItems, processingId, onDone, onDelete, onEdit, onStatusChange, onPreview }) {
  return (
    <div className="grid gap-4 overflow-x-auto bg-white p-4 transition-colors dark:bg-slate-900 md:grid-cols-5 lg:p-5">
      {STATUS_OPTIONS.map((status) => (
        <div key={status} className="min-w-60 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition-colors dark:border-slate-700 dark:bg-slate-950">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-slate-800 dark:text-white">{status}</h3>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-200">{groupedItems[status]?.length || 0}</span>
          </div>
          <div className="space-y-3">
            {(groupedItems[status] || []).map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                <h4 className="font-black text-slate-900 dark:text-white">{item.title}</h4>
                {item.description && <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-300">{item.description}</p>}
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-300"><UserRound className="h-3.5 w-3.5" /> {item.owner || "Unassigned"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge type="priority" value={item.priority} />
                  <Badge type="category" value={item.category} />
                </div>
                <p className={`mt-3 flex items-center gap-1 text-xs font-black ${isOverdue(item.due_date, item.status) ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-300"}`}>
                  <CalendarClock className="h-3.5 w-3.5" /> {formatDate(item.due_date)}
                </p>
                {getProofUrls(item).length > 0 && <ProofThumbnail urls={getProofUrls(item)} onPreview={onPreview} />}
                <div className="mt-3">
                  <CustomSelect
                    disabled={processingId === item.id}
                    value={item.status}
                    options={STATUS_OPTIONS}
                    onChange={(status) => onStatusChange(item, status)}
                  />
                </div>
                <RowActions item={item} processingId={processingId} onDone={onDone} onDelete={onDelete} onEdit={onEdit} compact />
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileItemCard({ item, processingId, onDone, onDelete, onEdit, onStatusChange, onPreview }) {
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-black text-slate-900 dark:text-white">{item.title}</h3>
          {item.description && <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-300">{item.description}</p>}
          <Owner value={item.owner} />
        </div>
        <RowActions item={item} processingId={processingId} onDone={onDone} onDelete={onDelete} onEdit={onEdit} compact />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge type="priority" value={item.priority} />
        <Badge type="status" value={item.status} />
        <Badge type="category" value={item.category} />
      </div>
      <p className={`text-sm font-bold ${isOverdue(item.due_date, item.status) ? "text-red-600" : "text-slate-600"}`}>Due: {formatDate(item.due_date)}</p>
      {getProofUrls(item).length > 0 && <ProofThumbnail urls={getProofUrls(item)} onPreview={onPreview} />}
      <CustomSelect
        disabled={processingId === item.id}
        value={item.status}
        options={STATUS_OPTIONS}
        onChange={(status) => onStatusChange(item, status)}
      />
    </article>
  );
}

function CompletionProofModal({
  item,
  files,
  previews,
  note,
  setNote,
  saving,
  onFileChange,
  onSave,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={onSave} className="mx-auto my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Upload Bukti Selesai</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Upload foto bukti untuk menandai <span className="font-black">{item.title}</span> sebagai Done.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block cursor-pointer rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFileChange(e.target.files)}
          />
          {previews.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {previews.map((preview, index) => (
                <img key={preview} src={preview} alt={`Preview bukti selesai ${index + 1}`} className="h-44 w-full rounded-2xl object-cover" />
              ))}
            </div>
          ) : (
            <div className="py-8">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                <Plus className="h-7 w-7" />
              </div>
              <p className="mt-3 font-black text-slate-900 dark:text-white">Pilih foto bukti pekerjaan</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Bisa pilih lebih dari 1 foto. Maksimal 2MB per foto.</p>
            </div>
          )}
        </label>

        {files.length > 0 && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">
            {files.map((file) => (
              <p key={`${file.name}-${file.size}`} className="truncate">File: {file.name}</p>
            ))}
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Catatan selesai
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Tambahkan ringkasan hasil pekerjaan atau detail bukti."
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-violet-500/20"
          />
          <p className="mt-1 text-right text-xs font-bold text-slate-400">{note.length}/500</p>
        </div>

        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:-mx-6 sm:px-6">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
          <button disabled={saving || files.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Uploading..." : "Upload & Mark Done"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProofThumbnail({ urls, onPreview }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {urls.slice(0, 4).map((url, index) => (
        <button key={url} type="button" onClick={() => onPreview?.(url)} className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
          <img src={url} alt={`Bukti pekerjaan selesai ${index + 1}`} className="h-24 w-full object-cover" />
          {index === 3 && urls.length > 4 && (
            <span className="absolute inset-0 grid place-items-center bg-slate-950/60 text-sm font-black text-white">+{urls.length - 4}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ProofLink({ urls, onPreview, note }) {
  return (
    <div className="mt-2 space-y-1">
      <button type="button" onClick={() => onPreview?.(urls[0])} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">
        <Camera className="h-3.5 w-3.5" /> Proof available ({urls.length})
      </button>
      {note && <p className="max-w-xs truncate text-xs font-medium text-slate-500 dark:text-slate-300">Note: {note}</p>}
    </div>
  );
}

function ImagePreviewModal({ image, onClose }) {
  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute -right-2 -top-2 rounded-full bg-white p-2 text-slate-900 shadow-xl">
          <X className="h-5 w-5" />
        </button>
        <img src={image} alt="Preview bukti pekerjaan selesai" className="max-h-[90vh] rounded-3xl object-contain shadow-2xl" />
      </div>
    </div>
  );
}

function getProofUrls(item) {
  if (Array.isArray(item.completion_image_urls) && item.completion_image_urls.length > 0) {
    return item.completion_image_urls;
  }

  return item.completion_image_url ? [item.completion_image_url] : [];
}

function ItemModal({ title, subtitle, item, setItem, saving, onSave, onCancel, submitText, loadingText }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={onSave} className="mx-auto my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">{subtitle}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FloatingInput label="Title" value={item.title || ""} onChange={(e) => setItem({ ...item, title: e.target.value })} />
          <FloatingTextarea label="Deskripsi Pekerjaan" value={item.description || ""} onChange={(e) => setItem({ ...item, description: e.target.value })} />
          <FloatingInput label="Owner" value={item.owner || ""} onChange={(e) => setItem({ ...item, owner: e.target.value })} />
          <FloatingSelect label="Priority" value={item.priority || "High"} options={PRIORITY_OPTIONS} onChange={(e) => setItem({ ...item, priority: e.target.value })} />
          <FloatingSelect label="Status" value={item.status || "Not Started"} options={STATUS_OPTIONS} onChange={(e) => setItem({ ...item, status: e.target.value })} />
          <FloatingSelect label="Category" value={item.category || "IGD"} options={CATEGORY_OPTIONS} onChange={(e) => setItem({ ...item, category: e.target.value })} />
          <FloatingInput type="date" label="Deadline" value={item.due_date || ""} onChange={(e) => setItem({ ...item, due_date: e.target.value })} />
        </div>

        <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:justify-end sm:-mx-6 sm:px-6">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
          <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? loadingText : submitText}
          </button>
        </div>
      </form>
    </div>
  );
}

function RowActions({ item, processingId, onDone, onDelete, onEdit, compact = false }) {
  return (
    <div className={`flex justify-end gap-1 ${compact ? "mt-3" : "opacity-100 transition md:opacity-70 md:group-hover:opacity-100"}`}>
      <IconButton disabled={processingId === item.id || item.status === "Done"} onClick={() => onDone(item)} title="Upload proof and mark as done" tone="emerald" icon={CheckCircle2} />
      <IconButton disabled={processingId === item.id} onClick={() => onEdit(item)} title="Edit" tone="slate" icon={Pencil} />
      <IconButton disabled={processingId === item.id} onClick={() => onDelete(item.id)} title="Delete" tone="red" icon={Trash2} />
    </div>
  );
}

function IconButton({ icon: Icon, tone, ...props }) {
  const tones = {
    emerald: "text-emerald-600 hover:bg-emerald-50",
    red: "text-red-600 hover:bg-red-50",
    slate: "text-slate-500 hover:bg-slate-100",
  };
  return (
    <button {...props} className={`rounded-xl p-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}>
      <Icon className="h-5 w-5" />
    </button>
  );
}

function StatCard({ title, value, icon: Icon, tone }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    indigo: "bg-indigo-100 text-indigo-700",
    red: "bg-red-100 text-red-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{title}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      </div>
      <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center p-12 text-slate-500">
      <Loader2 className="mb-3 h-8 w-8 animate-spin" />
      <p className="font-bold">Loading work items...</p>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="grid place-items-center p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-violet-100 text-violet-700">
        <Plus className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-xl font-black text-slate-900">Belum ada item</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Tambahkan work item pertama untuk mulai monitoring progress project.</p>
      <button onClick={onCreate} className="mt-5 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700">Add Item</button>
    </div>
  );
}

function Footer({ filteredCount, totalCount }) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <span>Showing {filteredCount} of {totalCount} items</span>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className="font-semibold text-emerald-600">Realtime enabled</span>
        <span className="text-xs font-black uppercase tracking-wide text-violet-600">Author by Sandika</span>
      </div>
    </div>
  );
}

function FloatingTextarea({ label, value, onChange }) {
  return (
    <div className="relative sm:col-span-2">
      <textarea
        value={value}
        onChange={onChange}
        placeholder=" "
        rows={3}
        className="peer w-full resize-none rounded-2xl border border-slate-200 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      <label className="absolute left-3 top-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-focus:top-1 peer-focus:text-xs peer-focus:text-violet-600 dark:text-slate-300 dark:peer-placeholder-shown:text-slate-400 dark:peer-focus:text-violet-300">
        {label}
      </label>
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
        className="peer w-full rounded-2xl border border-slate-200 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
      <label className="absolute left-3 top-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-focus:top-1 peer-focus:text-xs peer-focus:text-violet-600 dark:text-slate-300 dark:peer-placeholder-shown:text-slate-400 dark:peer-focus:text-violet-300">
        {label}
      </label>
    </div>
  );
}

function FloatingSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</label>
      <CustomSelect value={value} options={options} onChange={(nextValue) => onChange({ target: { value: nextValue } })} />
    </div>
  );
}

function MiniSelect({ label, value, options, onChange }) {
  return (
    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-200">
      {label}
      <div className="mt-1">
        <CustomSelect value={value} options={options} onChange={onChange} fullWidth />
      </div>
    </label>
  );
}

function SelectPill({ icon: Icon, value, onChange, options }) {
  return (
    <CustomSelect
      value={value}
      options={options.map(([optionValue, label]) => ({ value: optionValue, label }))}
      onChange={onChange}
      size="pill"
      icon={Icon}
    />
  );
}

function CustomSelect({ value, options, onChange, disabled = false, size = "md", icon: Icon, fullWidth = false }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );
  const selected = normalizedOptions.find((option) => option.value === value) || normalizedOptions[0];

  function updateDropdownPosition() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const maxHeight = Math.max(180, Math.min(260, spaceBelow > 180 ? spaceBelow : rect.top - 12));
    const openUp = spaceBelow < 180 && rect.top > spaceBelow;

    setDropdownStyle({
      position: "fixed",
      left: `${Math.min(Math.max(12, rect.left), window.innerWidth - rect.width - 12)}px`,
      top: openUp ? "auto" : `${rect.bottom + 8}px`,
      bottom: openUp ? `${window.innerHeight - rect.top + 8}px` : "auto",
      width: `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 99999,
    });
  }

  useEffect(() => {
    if (!open) return;

    updateDropdownPosition();

    function handleClickOutside(event) {
      const clickedTrigger = wrapperRef.current?.contains(event.target);
      const clickedDropdown = dropdownRef.current?.contains(event.target);

      if (!clickedTrigger && !clickedDropdown) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    function handleReposition() {
      updateDropdownPosition();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  const sizeClass =
    size === "sm"
      ? "min-w-[145px] rounded-full px-3 py-1.5 text-xs"
      : size === "pill"
      ? "min-w-[160px] rounded-2xl px-4 py-2.5 text-sm"
      : "rounded-2xl px-3 py-3 text-sm";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex ${fullWidth || size === "md" ? "w-full" : ""} items-center justify-between gap-2 border border-slate-200 bg-white font-black text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800 ${sizeClass}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="truncate">{selected?.label || "Select"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          {normalizedOptions.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                  active
                    ? "bg-violet-600 text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {active && <CheckCircle2 className="h-4 w-4" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function Owner({ value }) {
  return (
    <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-100 text-xs font-black text-cyan-700">{initials(value)}</span>
      <span className="truncate">{value || "Unassigned"}</span>
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
      "Not Started": "bg-slate-100 text-slate-700",
      "In Progress": "bg-indigo-100 text-indigo-700",
      Waiting: "bg-amber-100 text-amber-700",
      Blocked: "bg-red-100 text-red-700",
      Done: "bg-emerald-100 text-emerald-700",
    },
    category: CATEGORY_OPTIONS.reduce((acc, category) => {
      acc[category] = "bg-slate-100 text-slate-700";
      return acc;
    }, {}),
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${styles[type]?.[value] || "bg-slate-100 text-slate-700"}`}>{value || "-"}</span>;
}

function buildStats(items) {
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
}

function sanitizeItem(item) {
  return {
    title: item.title?.trim() || "",
    description: item.description?.trim() || "",
    owner: item.owner?.trim() || "",
    priority: item.priority || "High",
    status: item.status || "Not Started",
    due_date: item.due_date || null,
    category: item.category || "IGD",
  };
}

function sortItems(a, b, sort) {
  if (sort === "priority") return priorityRank(b.priority) - priorityRank(a.priority);
  if (sort === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));

  const dateA = a.due_date ? new Date(`${a.due_date}T00:00:00`) : new Date("9999-12-31");
  const dateB = b.due_date ? new Date(`${b.due_date}T00:00:00`) : new Date("9999-12-31");
  return dateA - dateB;
}

function priorityRank(priority) {
  return { Low: 1, Medium: 2, High: 3, Urgent: 4 }[priority] || 0;
}

function initials(name) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function isOverdue(date, status) {
  if (!date || status === "Done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${date}T00:00:00`) < today;
}

function formatDate(date) {
  if (!date) return "No date";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
